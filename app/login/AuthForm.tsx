"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { validateSignupEmail } from "@/lib/email";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const next = searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (isSignup) {
        const check = validateSignupEmail(email);
        if (!check.ok) {
          setError(check.message ?? "Enter a valid email address.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;

        // If email confirmation is disabled, a session is returned immediately.
        if (data.session) {
          router.push(safeNext);
          router.refresh();
        } else {
          setInfo(
            "Check your inbox — we sent you a confirmation link to activate your account.",
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(safeNext);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/15">
          <span className="text-3xl">💸</span>
        </div>
        <h1 className="text-2xl font-bold">Budgetvir</h1>
        <p className="mt-1 text-sm text-muted">
          {isSignup ? "Create your account" : "Welcome back"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {isSignup && (
          <Field
            label="Name"
            value={displayName}
            onChange={setDisplayName}
            type="text"
            placeholder="How friends see you"
            autoComplete="name"
          />
        )}
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          placeholder="••••••••"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={6}
        />

        {error && (
          <p className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-lg bg-brand/15 px-3 py-2 text-sm text-positive">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-full bg-brand py-3 font-semibold text-black transition active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-brand">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
      />
    </label>
  );
}
