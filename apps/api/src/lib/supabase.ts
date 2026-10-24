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
