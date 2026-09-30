import { deleteAccountSchema } from "@encore/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { users } from "../db/schema";
import { requireAuth, verifyPassword, type AuthVars } from "../lib/auth";
import { RateLimiter, tooMany } from "../lib/rate-limit";
import { validate } from "../lib/validate";

/** A stolen token shouldn't be a way to guess the password, so cap attempts per account. */
const deleteByAccount = new RateLimiter(5, 15 * 60_000);

export const accountRoutes = new Hono<AuthVars>()
  /**
   * Permanently deletes the signed-in account. Entries, season entries, live shows
   * (with their lineups and setlists), watchlist items and dismissed titles all go
   * with it via ON DELETE CASCADE. Shared catalog rows (titles, performers, venues)
   * hold no personal data and stay.
   */
  .post("/delete", requireAuth, validate("json", deleteAccountSchema), async (c) => {
    const userId = c.get("userId");
    const wait = deleteByAccount.hit(userId);
    if (wait > 0) tooMany(wait);
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new HTTPException(401, { message: "Account no longer exists" });
    // 403, not 401: a wrong password here must not sign the app out.
    if (!(await verifyPassword(c.req.valid("json").password, user.passwordHash))) {
      throw new HTTPException(403, { message: "Incorrect password" });
    }
    await db.delete(users).where(eq(users.id, userId));
    deleteByAccount.reset(userId);
    return c.body(null, 204);
  });
