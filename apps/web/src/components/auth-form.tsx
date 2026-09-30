"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorNote } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { signIn } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [form, setForm] = useState({ email: "", username: "", password: "", login: "" });
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await api.auth.login({ login: form.login, password: form.password })
          : await api.auth.register({ email: form.email, username: form.username, password: form.password });
      signIn(res);
      router.replace(next.startsWith("/") ? next : "/");
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="text-3xl font-black tracking-tight">{mode === "login" ? "Welcome back" : "Join Encore"}</h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "login" ? "Sign in to keep ranking." : "Rank everything you watch and every show you see."}
      </p>
      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-6">
        {mode === "login" ? (
          <div>
            <label className="label">Email or username</label>
            <input className="input" autoComplete="username" required {...field("login")} />
          </div>
        ) : (
          <>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" autoComplete="email" required {...field("email")} />
            </div>
            <div>
              <label className="label">Username</label>
              <input className="input" autoComplete="username" required pattern="[A-Za-z0-9_]{3,24}" {...field("username")} />
            </div>
          </>
        )}
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 8 : undefined}
            required
            {...field("password")}
          />
        </div>
        <ErrorNote error={error} />
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New here? <Link href="/register" className="text-brand">Create an account</Link>
          </>
        ) : (
          <>
            Have an account? <Link href="/login" className="text-brand">Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
