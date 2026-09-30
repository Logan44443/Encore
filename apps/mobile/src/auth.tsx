import { ApiError, type AuthResponse, type User } from "@encore/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setSessionExpiredHandler, tokenStore } from "./api";
import { deviceRegion } from "./region";

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
      const token = await tokenStore.load();
      if (!token) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const { user } = await api.auth.me();
        if (!cancelled) setUser(user);
        const synced = await syncCountry(user);
        if (!cancelled && synced !== user) setUser(synced);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) await tokenStore.set(null);
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
      await tokenStore.set(res.token);
      setUser(res.user);
      queryClient.clear();
      const synced = await syncCountry(res.user);
      if (synced !== res.user) setUser(synced);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await tokenStore.set(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // A 30-day token eventually expires; drop it so the app shows "Sign in" instead of failing every request.
  useEffect(() => {
    setSessionExpiredHandler((rejected) => {
      // Ignore a late 401 from a request sent before the user signed in again.
      if (rejected === tokenStore.get()) void signOut();
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
