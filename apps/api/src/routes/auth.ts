import { loginSchema, registerSchema, updateCountrySchema, updateServicesSchema } from "@encore/shared";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthVars } from "../lib/auth";
import { clientIp, RateLimiter, tooMany } from "../lib/rate-limit";
import { toUser, usernameIs } from "../lib/users";
import { validate } from "../lib/validate";
import { invalidateFeed } from "../services/feed";

const MINUTE = 60_000;
/** Password guessing: per IP, and per account so rotating IPs can't hammer one user. */
const loginByIp = new RateLimiter(30, 15 * MINUTE);
const loginByAccount = new RateLimiter(10, 15 * MINUTE);
const registerByIp = new RateLimiter(10, 60 * MINUTE);

/** Verified against when the account doesn't exist, so a miss takes as long as a wrong password. */
const dummyHash = hashPassword("encore-timing-equaliser");

export const authRoutes = new Hono<AuthVars>()
  .post("/register", validate("json", registerSchema), async (c) => {
    const wait = registerByIp.hit(clientIp(c));
    if (wait > 0) tooMany(wait);
    const body = c.req.valid("json");
    const email = body.email.toLowerCase();
    const taken = await db.query.users.findFirst({
      where: or(eq(users.email, email), usernameIs(body.username)),
    });
    if (taken) {
      throw new HTTPException(409, {
        message: taken.email === email ? "Email already registered" : "Username taken",
      });
    }
    const [user] = await db
      .insert(users)
      .values({
        email,
        username: body.username,
        displayName: body.displayName ?? body.username,
        passwordHash: await hashPassword(body.password),
        country: body.country ?? null,
      })
      .returning();
    return c.json({ token: await signToken(user.id), user: toUser(user) }, 201);
  })

  .post("/login", validate("json", loginSchema), async (c) => {
    const { login, password } = c.req.valid("json");
    const key = login.toLowerCase();
    const wait = Math.max(loginByIp.hit(clientIp(c)), loginByAccount.hit(key));
    if (wait > 0) tooMany(wait);
    const user = await db.query.users.findFirst({ where: or(eq(users.email, key), usernameIs(key)) });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) {
      throw new HTTPException(401, { message: "Invalid credentials" });
    }
    loginByAccount.reset(key);
    return c.json({ token: await signToken(user.id), user: toUser(user) });
  })

  .get("/me", requireAuth, async (c) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, c.get("userId")) });
    if (!user) throw new HTTPException(401, { message: "Account no longer exists" });
    return c.json({ user: toUser(user) });
  })

  /**
   * Device syncs send manual: false and are ignored once the user has picked a
   * country themselves, so travelling or a VPN never overrides their choice.
   */
  .put("/me/country", requireAuth, validate("json", updateCountrySchema), async (c) => {
    const { country, manual, reset } = c.req.valid("json");
    const userId = c.get("userId");
    const current = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!current) throw new HTTPException(401, { message: "Account no longer exists" });
    if (!manual && !reset && current.countryManual) return c.json({ user: toUser(current) });
    const [user] = await db.update(users).set({ country, countryManual: manual }).where(eq(users.id, userId)).returning();
    // The feed's "On Netflix" labels depend on the country.
    if (user.country !== current.country) invalidateFeed(userId);
    return c.json({ user: toUser(user) });
  })

  .put("/me/services", requireAuth, validate("json", updateServicesSchema), async (c) => {
    const userId = c.get("userId");
    const [user] = await db
      .update(users)
      .set({ services: c.req.valid("json").providerIds })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new HTTPException(401, { message: "Account no longer exists" });
    invalidateFeed(userId);
    return c.json({ user: toUser(user) });
  });
