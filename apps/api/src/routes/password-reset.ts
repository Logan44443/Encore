import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { passwordResetConfirmSchema, passwordResetRequestSchema, RESET_CODE_LENGTH } from "@encore/shared";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { passwordResetCodes, users } from "../db/schema";
import { env } from "../env";
import { hashPassword } from "../lib/auth";
import { mailer } from "../lib/mailer";
import { clientIp, RateLimiter, tooMany } from "../lib/rate-limit";
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

/** Keyed by the server secret, so a leaked table can't be brute-forced offline. */
function hashCode(userId: string, code: string): string {
  return createHmac("sha256", env.jwtSecret).update(`password-reset:${userId}:${code}`).digest("base64");
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

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (user) {
      const code = newCode();
      const values = { codeHash: hashCode(user.id, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL) };
      // A new request replaces any earlier code.
      await db
        .insert(passwordResetCodes)
        .values({ userId: user.id, ...values })
        .onConflictDoUpdate({ target: passwordResetCodes.userId, set: { ...values, createdAt: new Date() } });
      // Not awaited: a slow email provider would otherwise reveal that the account exists.
      void mailer
        .send({
          to: user.email,
          subject: "Your Encore password reset code",
          text: [
            `Hi ${user.displayName},`,
            "",
            `Your code to reset your Encore password is ${code}. It expires in ${CODE_TTL / MINUTE} minutes.`,
            "",
            "If you didn't ask for this, ignore this email; your password hasn't changed.",
          ].join("\n"),
        })
        .catch((err) => console.error("[password-reset] failed to send email", err));
    }
    return c.json({ ok: true as const });
  })

  .post("/confirm", validate("json", passwordResetConfirmSchema), async (c) => {
    const { code, password } = c.req.valid("json");
    const email = c.req.valid("json").email.toLowerCase();
    const wait = Math.max(confirmByIp.hit(clientIp(c)), confirmByEmail.hit(email));
    if (wait > 0) tooMany(wait);

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) throw new HTTPException(400, { message: INVALID });

    // Count the attempt before checking it, atomically, so parallel guesses can't exceed the limit.
    const [live] = await db
      .update(passwordResetCodes)
      .set({ attempts: sql`${passwordResetCodes.attempts} + 1` })
      .where(
        and(
          eq(passwordResetCodes.userId, user.id),
          lt(passwordResetCodes.attempts, MAX_ATTEMPTS),
          gt(passwordResetCodes.expiresAt, new Date()),
        ),
      )
      .returning();
    const expected = Buffer.from(live?.codeHash ?? "", "base64");
    const actual = Buffer.from(hashCode(user.id, code), "base64");
    if (!live || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new HTTPException(400, { message: INVALID });
    }

    const passwordHash = await hashPassword(password);
    // Whole seconds, because session tokens record their issue time in seconds (see sessions.ts).
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const done = await db.transaction(async (tx) => {
      // Deleting the code is what claims it, so the same code can't be used twice in parallel.
      const [claimed] = await tx
        .delete(passwordResetCodes)
        .where(and(eq(passwordResetCodes.userId, user.id), eq(passwordResetCodes.codeHash, live.codeHash)))
        .returning();
      if (!claimed) return false;
      await tx.update(users).set({ passwordHash, passwordChangedAt: changedAt }).where(eq(users.id, user.id));
      return true;
    });
    if (!done) throw new HTTPException(400, { message: INVALID });
    confirmByEmail.reset(email);
    return c.json({ ok: true as const });
  });
