import { loginSchema, registerSchema, updateCountrySchema, updateServicesSchema } from "@encore/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authUsers } from "../db/auth";
import { db } from "../db/client";
import { profiles, userSettings } from "../db/schema";
import { requireAuth, type AuthVars } from "../lib/auth";
import { assertAcceptableNames } from "../lib/moderation";
import { clientIp, RateLimiter, tooMany } from "../lib/rate-limit";
import { passwordSignIn, supabaseAdmin, tokensOf } from "../lib/supabase";
import { emailForLogin, loadUser, usernameIs } from "../lib/users";
import { validate } from "../lib/validate";
import { invalidateFeed } from "../services/feed";

const MINUTE = 60_000;
/** Password guessing: per IP, and per account so rotating IPs can't hammer one user. */
const loginByIp = new RateLimiter(30, 15 * MINUTE);
const loginByAccount = new RateLimiter(10, 15 * MINUTE);
const registerByIp = new RateLimiter(10, 60 * MINUTE);

export const authRoutes = new Hono<AuthVars>()
  /**
   * Creates the Supabase Auth user; the database's sign-up trigger creates the
   * profile from the metadata. Created already confirmed, like accounts always
   * were here, then signed in so the app gets a session straight away.
   */
  .post("/register", validate("json", registerSchema), async (c) => {
    const wait = registerByIp.hit(clientIp(c));
    if (wait > 0) tooMany(wait);
    const body = c.req.valid("json");
    assertAcceptableNames(body.username, body.displayName);
    const email = body.email.toLowerCase();
    const [emailTaken] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email)).limit(1);
    if (emailTaken) throw new HTTPException(409, { message: "Email already registered" });
    const [nameTaken] = await db.select({ id: profiles.id }).from(profiles).where(usernameIs(body.username)).limit(1);
    if (nameTaken) throw new HTTPException(409, { message: "Username taken" });

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { username: body.username, display_name: body.displayName ?? body.username, country: body.country ?? null },
    });
    if (error || !data.user) {
      if (error?.code === "email_exists") throw new HTTPException(409, { message: "Email already registered" });
      if (error?.code === "weak_password") throw new HTTPException(400, { message: error.message });
      // Someone took the username between the check above and now: the trigger refused it.
      if (error?.message.toLowerCase().includes("database error")) throw new HTTPException(409, { message: "Username taken" });
      throw error ?? new Error("Supabase didn't return the new user");
    }
    const session = await passwordSignIn(email, body.password);
    if (!session) throw new Error("Couldn't sign in to the account just created");
    return c.json({ ...tokensOf(session), user: await loadUser(data.user.id) }, 201);
  })

  /** Email or username. Usernames are turned into emails here, so nobody's email ever reaches the app. */
  .post("/login", validate("json", loginSchema), async (c) => {
    const { login, password } = c.req.valid("json");
    const key = login.toLowerCase();
    const wait = Math.max(loginByIp.hit(clientIp(c)), loginByAccount.hit(key));
    if (wait > 0) tooMany(wait);
    const email = await emailForLogin(key);
    const session = email ? await passwordSignIn(email, password) : null;
    if (!session) throw new HTTPException(401, { message: "Invalid credentials" });
    loginByAccount.reset(key);
    return c.json({ ...tokensOf(session), user: await loadUser(session.user.id) });
  })

  .get("/me", requireAuth, async (c) => c.json({ user: await loadUser(c.get("userId")) }))

  /**
   * Device syncs send manual: false and are ignored once the user has picked a
   * country themselves, so travelling or a VPN never overrides their choice.
   */
  .put("/me/country", requireAuth, validate("json", updateCountrySchema), async (c) => {
    const { country, manual, reset } = c.req.valid("json");
    const userId = c.get("userId");
    const current = await loadUser(userId);
    if (!manual && !reset && current.countryManual) return c.json({ user: current });
    await db.update(userSettings).set({ country, countryManual: manual }).where(eq(userSettings.userId, userId));
    // The feed's "On Netflix" labels depend on the country.
    if (country !== current.country) invalidateFeed(userId);
    return c.json({ user: await loadUser(userId) });
  })

  .put("/me/services", requireAuth, validate("json", updateServicesSchema), async (c) => {
    const userId = c.get("userId");
    await db.update(userSettings).set({ services: c.req.valid("json").providerIds }).where(eq(userSettings.userId, userId));
    invalidateFeed(userId);
    return c.json({ user: await loadUser(userId) });
  });
