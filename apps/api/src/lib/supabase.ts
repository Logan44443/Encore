import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { HTTPException } from "hono/http-exception";
import { env } from "../env";

const serverOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Supabase with the secret key: creates, updates and deletes accounts. Server only. */
export const supabaseAdmin: SupabaseClient = createClient(env.supabaseUrl, env.supabaseSecretKey, serverOptions);

/**
 * A throwaway client for acting as one person (signing in, checking a reset
 * code). Never shared between requests, so one person's session can't leak into another's.
 */
export function supabaseForOneCall(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, serverOptions);
}

/** What the app needs to hold a Supabase session. */
export interface SessionTokens {
  token: string;
  refreshToken: string;
}

export const tokensOf = (session: Session): SessionTokens => ({
  token: session.access_token,
  refreshToken: session.refresh_token,
});

/** Signs in on the server. Null for a wrong email or password. */
export async function passwordSignIn(email: string, password: string): Promise<Session | null> {
  const { data, error } = await supabaseForOneCall().auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 400 || error.code === "invalid_credentials") return null;
    if (error.status === 429) throw new HTTPException(429, { message: "Too many attempts. Please wait a moment and try again." });
    throw error;
  }
  return data.session;
}

/**
 * Sets a new password as the signed-in person, with their own access token.
 * Supabase then keeps this session and ends every other one; the admin API
 * (updateUserById) would end this one too and sign the phone out.
 */
export async function changeOwnPassword(token: string, password: string) {
  const res = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: env.supabaseSecretKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error_code?: string; code?: string; msg?: string; message?: string };
  return {
    status: res.status,
    code: body.error_code ?? body.code,
    message: body.msg ?? body.message ?? "Couldn't change the password. Try again.",
  };
}
