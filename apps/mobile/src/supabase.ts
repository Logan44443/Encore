import { createClient, processLock, type Session } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

/**
 * The publishable key is meant to ship inside the app: Row Level Security is
 * what protects the data. Both values come from apps/mobile/.env locally and
 * from eas.json for builds. The secret key never goes anywhere near the app.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env, then restart Expo with -c.");
}

const SESSION_KEY = "encore.session";

/** Sessions live in the iOS Keychain, like the old sign-in token did. */
const keychain = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: keychain,
    storageKey: SESSION_KEY,
    autoRefreshToken: true,
    persistSession: true,
    // Sign-in is email/username + password through the API: no magic links or OAuth redirects.
    detectSessionInUrl: false,
    // React Native has no Web Locks API; this keeps two refreshes from racing.
    lock: processLock,
  },
});

/** Only refresh while the app is open, so a backgrounded app doesn't fail on a dead network. */
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** In-memory copy so requests don't read the Keychain each time. */
let current: Session | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  current = session;
});

/** The access token for API requests, refreshed first when it's about to expire. */
export async function accessToken(): Promise<string | null> {
  if (current?.expires_at && current.expires_at * 1000 - Date.now() > 60_000) return current.access_token;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** The token API requests are sending right now, for telling a stale 401 from a real one. */
export const currentToken = () => current?.access_token ?? null;

/**
 * Drops the session on this device even when Supabase can't be reached
 * (supabase.auth.signOut keeps the session if its network call fails).
 */
export async function forgetSession() {
  current = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
