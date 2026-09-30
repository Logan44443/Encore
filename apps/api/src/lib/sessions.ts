import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { jwtVerify } from "jose";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";

const secret = new TextEncoder().encode(env.jwtSecret);

/**
 * Rejects session tokens issued before the account's password was last reset,
 * so a reset signs out every device (including whoever else had the password).
 * Invalid tokens pass through untouched; requireAuth/optionalAuth handle them.
 */
export const rejectSessionsBeforePasswordChange = createMiddleware(async (c, next) => {
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
        columns: { passwordChangedAt: true },
      });
      if (user?.passwordChangedAt && iat * 1000 < user.passwordChangedAt.getTime()) {
        throw new HTTPException(401, { message: "Your password was changed. Sign in again." });
      }
    }
  }
  await next();
});
