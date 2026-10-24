import {
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  updatePrivacySchema,
  updateProfileSchema,
} from "@encore/shared";
import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authUsers } from "../db/auth";
import { db } from "../db/client";
import { profiles } from "../db/schema";
import { requireAuth, type AuthVars } from "../lib/auth";
import { mailer } from "../lib/mailer";
import { assertAcceptableNames } from "../lib/moderation";
import { RateLimiter, tooMany } from "../lib/rate-limit";
import { passwordSignIn, supabaseAdmin } from "../lib/supabase";
import { findAccount, loadUser, usernameIs } from "../lib/users";
import { validate } from "../lib/validate";

/**
 * A stolen token shouldn't be a way to guess the password, so cap attempts per
 * account. Shared by every route here that asks for the current password.
 */
const passwordCheckByAccount = new RateLimiter(5, 15 * 60_000);

/** Loads the signed-in user and checks their password, or throws. */
async function confirmPassword(userId: string, password: string) {
  const wait = passwordCheckByAccount.hit(userId);
  if (wait > 0) tooMany(wait);
  const account = await findAccount(userId);
  if (!account) throw new HTTPException(401, { message: "Account no longer exists" });
  const check = await passwordSignIn(account.email, password);
  // 403, not 401: a wrong password here must not sign the app out.
  if (!check) throw new HTTPException(403, { message: "Incorrect password" });
  // Checking the password signed in a new session; end it straight away.
  await supabaseAdmin.auth.admin.signOut(check.access_token, "local");
  passwordCheckByAccount.reset(userId);
  return account;
}

/** Security notices go out in the background so a slow email provider never holds up the app. */
function notify(to: string, subject: string, lines: string[]) {
  void mailer.send({ to, subject, text: lines.join("\n") }).catch((err) => console.error("[account] failed to send email", err));
}

/** Supabase Auth errors become plain API errors. */
function authFailure(error: { message: string; code?: string; status?: number }): never {
  if (error.code === "email_exists") throw new HTTPException(409, { message: "Email already registered" });
  if (error.code === "weak_password" || error.code === "same_password") throw new HTTPException(400, { message: error.message });
  throw error;
}

export const accountRoutes = new Hono<AuthVars>()
  .patch("/profile", requireAuth, validate("json", updateProfileSchema), async (c) => {
    const userId = c.get("userId");
    const { displayName, username } = c.req.valid("json");
    assertAcceptableNames(displayName, username);
    if (username !== undefined) {
      const [taken] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(usernameIs(username), ne(profiles.id, userId)))
        .limit(1);
      if (taken) throw new HTTPException(409, { message: "Username taken" });
    }
    await db.update(profiles).set({ displayName, username }).where(eq(profiles.id, userId));
    return c.json({ user: await loadUser(userId) });
  })

  .patch("/privacy", requireAuth, validate("json", updatePrivacySchema), async (c) => {
    const userId = c.get("userId");
    await db.update(profiles).set(c.req.valid("json")).where(eq(profiles.id, userId));
    return c.json({ user: await loadUser(userId) });
  })

  .put("/email", requireAuth, validate("json", changeEmailSchema), async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const current = await confirmPassword(userId, body.password);
    const email = body.email.toLowerCase();
    if (email === current.email) return c.json({ user: await loadUser(userId) });
    const [taken] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email)).limit(1);
    if (taken) throw new HTTPException(409, { message: "Email already registered" });
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) authFailure(error);
    // Tell the old address, so a hijacker can't quietly move the account away from its owner.
    notify(current.email, "Your Encore email was changed", [
      `Hi ${current.profile.displayName},`,
      "",
      `The email on your Encore account @${current.profile.username} was changed to ${email}.`,
      "",
      "If you didn't do this, contact Encore support straight away so we can help you get your account back.",
    ]);
    return c.json({ user: await loadUser(userId) });
  })

  /** Signs out every other device; this one stays signed in. */
  .put("/password", requireAuth, validate("json", changePasswordSchema), async (c) => {
    const userId = c.get("userId");
    const { currentPassword, newPassword } = c.req.valid("json");
    const current = await confirmPassword(userId, currentPassword);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) authFailure(error);
    await supabaseAdmin.auth.admin.signOut(c.get("caller").token, "others");
    notify(current.email, "Your Encore password was changed", [
      `Hi ${current.profile.displayName},`,
      "",
      "The password on your Encore account was just changed, and every other device was signed out.",
      "",
      "If you didn't do this, reset your password from the Encore sign-in screen straight away.",
    ]);
    return c.json({ user: await loadUser(userId) });
  })

  /** For a lost phone or a shared login: every session except this one stops working. */
  .post("/sign-out-others", requireAuth, async (c) => {
    const { error } = await supabaseAdmin.auth.admin.signOut(c.get("caller").token, "others");
    if (error) throw error;
    return c.json({ user: await loadUser(c.get("userId")) });
  })

  /**
   * Permanently deletes the signed-in account. Deleting the Supabase Auth user
   * cascades to the profile and from there to everything they logged: entries
   * and reviews, season and episode entries, live shows (with lineups, setlists
   * and notes), watchlist items, dismissed titles, friendships, friend requests,
   * blocks and "watched with" tags. Reports keep the reported username but lose
   * the link to the account. Shared catalog rows hold no personal data and stay.
   */
  .post("/delete", requireAuth, validate("json", deleteAccountSchema), async (c) => {
    const userId = c.get("userId");
    await confirmPassword(userId, c.req.valid("json").password);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return c.body(null, 204);
  });
