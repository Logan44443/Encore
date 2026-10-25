import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { passwordResetConfirmSchema, passwordResetRequestSchema, RESET_CODE_LENGTH } from "@encore/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authUsers } from "../db/auth";
import { db } from "../db/client";
import { env } from "../env";
import { mailer } from "../lib/mailer";
import { clientIp, RateLimiter, tooMany } from "../lib/rate-limit";
import { supabaseAdmin } from "../lib/supabase";
import { validate } from "../lib/validate";

const MINUTE = 60_000;
const CODE_TTL = 15 * MINUTE;
/** Wrong guesses allowed per code before it is burned (a 6-digit code has a million values). */
const MAX_ATTEMPTS = 5;

/** Stops the endpoint being used to spam someone's inbox. */
const requestByIp = new RateLimiter(10, 60 * MINUTE);
const requestByEmail = new RateLimiter(3, 15 * MINUTE);
const confirmByIp = new RateLimiter(30, 15 * MINUTE);
const confirmByEmail = new RateLimiter(10, 15 * MINUTE);

const INVALID = "That code is wrong or has expired. Request a new one.";

/**
 * Live codes by email. The API sends and checks the code itself rather than
 * Supabase's reset email, whose template can't be edited on the free plan
 * without custom SMTP. In memory, like the rate limits: one API instance, and
 * a restart only means asking for a new code.
 */
const codes = new Map<string, { userId: string; hash: Buffer; expiresAt: number; attempts: number }>();

/** Keyed by a server secret, so a leaked hash can't be brute-forced offline. */
function hashCode(userId: string, code: string): Buffer {
  return createHmac("sha256", env.supabaseSecretKey).update(`password-reset:${userId}:${code}`).digest();
}

function newCode(): string {
  return String(randomInt(0, 10 ** RESET_CODE_LENGTH)).padStart(RESET_CODE_LENGTH, "0");
}

export const passwordResetRoutes = new Hono()
  /** Always answers the same way so it can't be used to find out which emails have accounts. */
  .post("/request", validate("json", passwordResetRequestSchema), async (c) => {
    const email = c.req.valid("json").email.toLowerCase();
    const wait = Math.max(requestByIp.hit(clientIp(c)), requestByEmail.hit(email));
    if (wait > 0) tooMany(wait);

    const [user] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email)).limit(1);
    if (user) {
      const code = newCode();
      // A new request replaces any earlier code.
      codes.set(email, { userId: user.id, hash: hashCode(user.id, code), expiresAt: Date.now() + CODE_TTL, attempts: 0 });
      // Not awaited: a slow email provider would otherwise reveal that the account exists.
      void mailer
        .send({
          to: email,
          subject: "Your Encore password reset code",
          text: [
            `Your code to reset your Encore password is ${code}. It expires in ${CODE_TTL / MINUTE} minutes.`,
            "",
            "If you didn't ask for this, ignore this email; your password hasn't changed.",
          ].join("\n"),
        })
        .catch((err) => console.error("[password-reset] failed to send email", err));
    }
    return c.json({ ok: true as const });
  })

  /** Sets the new password and signs out every session, as a reset always has. Sign in afterwards. */
  .post("/confirm", validate("json", passwordResetConfirmSchema), async (c) => {
    const { code, password } = c.req.valid("json");
    const email = c.req.valid("json").email.toLowerCase();
    const wait = Math.max(confirmByIp.hit(clientIp(c)), confirmByEmail.hit(email));
    if (wait > 0) tooMany(wait);

    const live = codes.get(email);
    if (!live || live.expiresAt < Date.now() || live.attempts >= MAX_ATTEMPTS) {
      codes.delete(email);
      throw new HTTPException(400, { message: INVALID });
    }
    live.attempts += 1;
    if (!timingSafeEqual(live.hash, hashCode(live.userId, code))) throw new HTTPException(400, { message: INVALID });

    // The admin update also ends every session the account has.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(live.userId, { password });
    if (error) {
      if (error.code === "weak_password" || error.code === "same_password") throw new HTTPException(400, { message: error.message });
      throw error;
    }
    codes.delete(email);
    confirmByEmail.reset(email);
    return c.json({ ok: true as const });
  });
