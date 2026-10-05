"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

type Mode = "login" | "signup";

const COPY = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to continue your campaigns.",
    submit: "Sign in",
    switchText: `New to ${APP_NAME}?`,
    switchLink: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your workspace",
    subtitle: "Go from a business idea to a ready campaign package.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/login",
  },
} as const;

/** Only allow redirects to our own pages after login. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/overview";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const errs: typeof fieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid email address.";
    if (mode === "signup" && password.length < 8) errs.password = "Use at least 8 characters.";
    if (mode === "login" && !password) errs.password = "Enter your password.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const body = mode === "signup" ? { email, password, workspace_name: workspace || null } : { email, password };
      await api(`/auth/${mode}`, { method: "POST", json: body });
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-muted">{copy.subtitle}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {error ? (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {mode === "signup" ? (
          <Field
            label="Workspace name"
            name="workspace"
            autoComplete="organization"
            placeholder="e.g. Nova Studio"
            hint="Optional. You can change it later."
            maxLength={120}
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
          />
        ) : null}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          error={fieldErrors.email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          maxLength={128}
          hint={mode === "signup" ? "At least 8 characters." : undefined}
          value={password}
          error={fieldErrors.password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "signup" ? (
          <p className="text-sm text-muted">
            We keep only what you enter, behind your password. Read{" "}
            <Link href="/privacy" className="font-semibold text-cyan underline underline-offset-2">
              how we handle your data
            </Link>
            .
          </p>
        ) : null}

        <Button type="submit" loading={loading} className="w-full">
          {copy.submit}
          {loading ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {copy.switchText}{" "}
        <Link href={copy.switchHref} className="font-semibold text-cyan hover:underline">
          {copy.switchLink}
        </Link>
      </p>
    </div>
  );
}
