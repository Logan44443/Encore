import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const secret = new TextEncoder().encode(env.jwtSecret);

export function signToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

async function userIdFromHeader(header: string | undefined): Promise<string | null> {
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), secret, { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export type AuthVars = { Variables: { userId: string } };
export type OptionalAuthVars = { Variables: { userId: string | null } };

export const requireAuth = createMiddleware<AuthVars>(async (c, next) => {
  const userId = await userIdFromHeader(c.req.header("Authorization"));
  if (!userId) throw new HTTPException(401, { message: "Not signed in" });
  c.set("userId", userId);
  await next();
});

export const optionalAuth = createMiddleware<OptionalAuthVars>(async (c, next) => {
  c.set("userId", await userIdFromHeader(c.req.header("Authorization")));
  await next();
});
