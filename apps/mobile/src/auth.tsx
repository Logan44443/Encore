import { ApiError, type AuthResponse, type User } from "@encore/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { api, setSessionExpiredHandler } from "./api";
import { deviceRegion } from "./region";
import { currentToken, forgetSession, supabase } from "./supabase";

/** Where the app kept its own sign-in token before Supabase. Cleared on start-up. */
const LEGACY_TOKEN_KEY = "encore.token";

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (res: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Keeps the saved country in step with the device region until the user picks
 * one on their profile; the server ignores the sync once they have.
 */
async function syncCountry(user: User): Promise<User> {
  const region = deviceRegion();
  if (user.countryManual || !region || region === user.country) return user;
  try {
    return (await api.auth.setCountry({ country: region, manual: false })).user;
  } catch {
    return user;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY).catch(() => {});
      // Waits for the saved session to load, refreshing it if it has expired.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const { user } = await api.auth.me();
        if (!cancelled) setUser(user);
        const synced = await syncCountry(user);
        if (!cancelled && synced !== user) setUser(synced);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) await forgetSession();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (res: AuthResponse) => {
      const { error } = await supabase.auth.setSession({ access_token: res.token, refresh_token: res.refreshToken });
      if (error) throw new ApiError(0, "Signed in, but couldn't save the session. Try again.", error);
      setUser(res.user);
      queryClient.clear();
      const synced = await syncCountry(res.user);
      if (synced !== res.user) setUser(synced);
    },
    [queryClient],
  );

  /** Signs out this device only; other devices stay signed in. */
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) await forgetSession();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // Supabase ends the session itself when a refresh is refused (signed out elsewhere, password reset, account deleted).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      setUser(null);
      queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  // The API refuses a session that was revoked; drop it so the app shows "Sign in" instead of failing every request.
  useEffect(() => {
    setSessionExpiredHandler((rejected) => {
      // Ignore a late 401 from a request sent before the user signed in again.
      if (rejected === currentToken()) void signOut();
    });
    return () => setSessionExpiredHandler(null);
  }, [signOut]);

  return <AuthContext.Provider value={{ user, ready, signIn, signOut, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Country used for "Where to watch": your saved choice, else the device region, else US. */
export function useCountry(): string {
  const { user } = useAuth();
  return user?.country ?? deviceRegion() ?? "US";
}
