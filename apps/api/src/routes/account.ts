import { changeEmailSchema, changePasswordSchema, deleteAccountSchema, updateProfileSchema } from "@encore/shared";
import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthVars } from "../lib/auth";
import { mailer } from "../lib/mailer";
import { RateLimiter, tooMany } from "../lib/rate-limit";
import { revokeSessionsNow } from "../lib/sessions";
import { toUser } from "../lib/users";
import { validate } from "../lib/validate";

/**
 * A stolen token shouldn't be a way to guess the password, so cap attempts per
 * account. Shared by every route here that asks for the current password.
 */
const passwordCheckByAccount = new RateLimiter(5, 15 * 60_000);

async function currentUser(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new HTTPException(401, { message: "Account no longer exists" });
  return user;
}

/** Loads the signed-in user and checks their password, or throws. */
async function confirmPassword(userId: string, password: string) {
  const wait = passwordCheckByAccount.hit(userId);
  if (wait > 0) tooMany(wait);
  const user = await currentUser(userId);
  // 403, not 401: a wrong password here must not sign the app out.
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new HTTPException(403, { message: "Incorrect password" });
  }
  passwordCheckByAccount.reset(userId);
  return user;
}

/** Security notices go out in the background so a slow email provider never holds up the app. */
function notify(to: string, subject: string, lines: string[]) {
  void mailer.send({ to, subject, text: lines.join("\n") }).catch((err) => console.error("[account] failed to send email", err));
}

export const accountRoutes = new Hono<AuthVars>()
  .patch("/profile", requireAuth, validate("json", updateProfileSchema), async (c) => {
    const userId = c.get("userId");
    const { displayName, username } = c.req.valid("json");
    if (username !== undefined) {
      const taken = await db.query.users.findFirst({ where: and(eq(users.username, username), ne(users.id, userId)) });
      if (taken) throw new HTTPException(409, { message: "Username taken" });
    }
    const [user] = await db.update(users).set({ displayName, username }).where(eq(users.id, userId)).returning();
    if (!user) throw new HTTPException(401, { message: "Account no longer exists" });
    return c.json({ user: toUser(user) });
  })

  .put("/email", requireAuth, validate("json", changeEmailSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const current = await confirmPassword(userId, body.password);
    const email = body.email.toLowerCase();
    if (email === current.email) return c.json({ user: toUser(current) });
    const taken = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (taken) throw new HTTPException(409, { message: "Email already registered" });
    const [user] = await db.update(users).set({ email }).where(eq(users.id, userId)).returning();
    // Tell the old address, so a hijacker can't quietly move the account away from its owner.
    notify(current.email, "Your Encore email was changed", [
      `Hi ${current.displayName},`,
      "",
      `The email on your Encore account @${current.username} was changed to ${email}.`,
      "",
      "If you didn't do this, contact Encore support straight away so we can help you get your account back.",
    ]);
    return c.json({ user: toUser(user) });
  })

  /** Signs out every other device and returns a fresh token for this one. */
  .put("/password", requireAuth, validate("json", changePasswordSchema), async (c) => {
    const userId = c.get("userId");
    const { currentPassword, newPassword } = c.req.valid("json");
    const current = await confirmPassword(userId, currentPassword);
    const [user] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), sessionsRevokedAt: revokeSessionsNow() })
      .where(eq(users.id, userId))
      .returning();
    notify(current.email, "Your Encore password was changed", [
      `Hi ${current.displayName},`,
      "",
      "The password on your Encore account was just changed, and every other device was signed out.",
      "",
      "If you didn't do this, reset your password from the Encore sign-in screen straight away.",
    ]);
    return c.json({ token: await signToken(userId), user: toUser(user) });
  })

  /** For a lost phone or a shared login: every session except this one stops working. */
  .post("/sign-out-others", requireAuth, async (c) => {
    const userId = c.get("userId");
    const [user] = await db
      .update(users)
      .set({ sessionsRevokedAt: revokeSessionsNow() })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new HTTPException(401, { message: "Account no longer exists" });
    return c.json({ token: await signToken(userId), user: toUser(user) });
  })

  /**
   * Permanently deletes the signed-in account. Entries, season entries, live shows
   * (with their lineups and setlists), watchlist items and dismissed titles all go
   * with it via ON DELETE CASCADE. Shared catalog rows (titles, performers, venues)
   * hold no personal data and stay.
   */
  .post("/delete", requireAuth, validate("json", deleteAccountSchema), async (c) => {
    const userId = c.get("userId");
    await confirmPassword(userId, c.req.valid("json").password);
    await db.delete(users).where(eq(users.id, userId));
    return c.body(null, 204);
  });
