import { loginSchema, registerSchema, updateCountrySchema, type User } from "@encore/shared";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthVars } from "../lib/auth";
import { validate } from "../lib/validate";

const toUser = (u: typeof users.$inferSelect): User => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  country: u.country,
  countryManual: u.countryManual,
});

export const authRoutes = new Hono<AuthVars>()
  .post("/register", validate("json", registerSchema), async (c) => {
    const body = c.req.valid("json");
    const email = body.email.toLowerCase();
    const taken = await db.query.users.findFirst({
      where: or(eq(users.email, email), eq(users.username, body.username)),
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
    const user = await db.query.users.findFirst({ where: or(eq(users.email, key), eq(users.username, key)) });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HTTPException(401, { message: "Invalid credentials" });
    }
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
    return c.json({ user: toUser(user) });
  });
