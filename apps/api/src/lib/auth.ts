import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { authSessions } from "../db/auth";
import { db } from "../db/client";
import { supabaseAdmin } from "./supabase";

export interface Caller {
  userId: string;
  /** The Supabase session this token belongs to. */
  sessionId: string | null;
  token: string;
}

/**
 * Checks a Supabase access token: signature (against the project's published
 * keys, cached), expiry, and that its session still exists, so a device signed
 * out by "sign out of other devices" or a password change stops working at once
 * instead of when its token expires.
 */
async function callerFromHeader(header: string | undefined): Promise<Caller | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims?.sub || claims.role !== "authenticated") return null;
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : null;
  if (sessionId) {
    const live = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, claims.sub)))
      .limit(1);
    if (!live.length) throw new HTTPException(401, { message: "You were signed out. Sign in again." });
  }
  return { userId: claims.sub, sessionId, token };
}

export type AuthVars = { Variables: { userId: string; caller: Caller } };
export type OptionalAuthVars = { Variables: { userId: string | null; caller: Caller | null } };

export const requireAuth = createMiddleware<AuthVars>(async (c, next) => {
  const caller = await callerFromHeader(c.req.header("Authorization"));
  if (!caller) throw new HTTPException(401, { message: "Not signed in" });
  c.set("userId", caller.userId);
  c.set("caller", caller);
  await next();
});

export const optionalAuth = createMiddleware<OptionalAuthVars>(async (c, next) => {
  const caller = await callerFromHeader(c.req.header("Authorization"));
  c.set("userId", caller?.userId ?? null);
  c.set("caller", caller);
  await next();
});
