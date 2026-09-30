"use client";

import { ApiError, type AuthResponse, type User } from "@encore/shared";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "./api";

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (res: AuthResponse) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api.auth
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) tokenStore.set(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(
    (res: AuthResponse) => {
      tokenStore.set(res.token);
      setUser(res.user);
      queryClient.clear();
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Redirects to /login when signed out; renders nothing until auth is resolved. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  if (!ready || !user) return <div className="py-24 text-center text-muted">Loading…</div>;
  return <>{children}</>;
}
