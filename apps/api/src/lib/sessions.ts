import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { jwtVerify } from "jose";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";

const secret = new TextEncoder().encode(env.jwtSecret);

/**
 * Rejects session tokens issued before the account's sessions were last revoked
 * (password change or reset, or "Sign out of other devices"), so every other
 * device, including whoever else had the password, is signed out.
 * Invalid tokens pass through untouched; requireAuth/optionalAuth handle them.
 */
export const rejectRevokedSessions = createMiddleware(async (c, next) => {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    let sub: string | undefined;
    let iat: number | undefined;
    try {
      ({ sub, iat } = (await jwtVerify(header.slice(7), secret, { algorithms: ["HS256"] })).payload);
    } catch {
      // Not a valid session; leave it to the auth middleware.
    }
    if (sub && iat !== undefined) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, sub),
        columns: { sessionsRevokedAt: true },
      });
      if (user?.sessionsRevokedAt && iat * 1000 < user.sessionsRevokedAt.getTime()) {
        throw new HTTPException(401, { message: "You were signed out. Sign in again." });
      }
    }
  }
  await next();
});

/**
 * Revocation time for a session change. Whole seconds, because session tokens
 * record their issue time in seconds: a token signed right after this still passes.
 */
export function revokeSessionsNow(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}
