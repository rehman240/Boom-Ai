"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

function ErrorNote({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {text}
    </p>
  );
}

function BackToSignIn() {
  return (
    <p className="mt-6 text-sm text-muted">
      Remembered it?{" "}
      <Link href="/login" className="font-semibold text-cyan hover:underline">
        Sign in
      </Link>
    </p>
  );
}

/** Whether email reset works on this server. Hidden until it does, so nobody is told an email
 * was sent when it can't be. `null` while asking. */
export function useResetAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ password_reset: boolean }>("/auth/options")
      .then((o) => setAvailable(o.password_reset))
      .catch(() => setAvailable(false));
  }, []);
  return available;
}

/** Step 1: ask for the email. The answer is the same whether or not it has an account. */
export function ForgotPasswordForm() {
  const available = useResetAvailable();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError("");
    setLoading(true);
    try {
      const out = await api<{ detail: string }>("/auth/forgot-password", { method: "POST", json: { email } });
      setSent(out.detail);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }

  if (available === null) return null;

  if (!available) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Password reset isn&apos;t available yet</h1>
        <p className="mt-2 text-muted">Resetting a password by email will be added soon.</p>
        <BackToSignIn />
      </div>
    );
  }

  if (sent) {
    return (
      <div>
        <MailCheck className="h-10 w-10 text-cyan" aria-hidden="true" />
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-3 text-muted" role="status">
          {sent}
        </p>
        <p className="mt-3 text-sm text-subtle">Nothing there? Look in your spam folder, or try again in a minute.</p>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Forgot your password?</h1>
      <p className="mt-2 text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {error ? <ErrorNote text={error} /> : null}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          error={fieldError || undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" loading={loading} className="w-full">
          Send reset link
          {loading ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>
      <BackToSignIn />
    </div>
  );
}

/** Step 2: the link from the email opens this page with the token after "#". */
export function ResetPasswordForm() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Read once, then take it out of the address bar so it isn't left in history or shared.
    const found = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    // Keep a token already read: the effect can run twice, and by then the address is cleared.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken((prev) => found || prev || "");
    if (found) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const errs: typeof fieldErrors = {};
    if (password.length < 8) errs.password = "Use at least 8 characters.";
    if (confirm !== password) errs.confirm = "The two passwords don't match.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api("/auth/reset-password", { method: "POST", json: { token, password } });
      router.replace("/overview");
      router.refresh();
    } catch (err) {
      setError(message(err));
      setLoading(false);
    }
  }

  if (token === null) return null; // reading the link

  if (!token) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">This link isn&apos;t complete</h1>
        <p className="mt-2 text-muted">Open the link from the email again, or ask for a new one.</p>
        <Link href="/forgot-password" className="mt-6 inline-block font-semibold text-cyan hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-muted">You&apos;ll be signed in, and signed out on your other devices.</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {error ? (
          <div className="space-y-2">
            <ErrorNote text={error} />
            <Link href="/forgot-password" className="inline-block text-sm font-semibold text-cyan hover:underline">
              Send a new link
            </Link>
          </div>
        ) : null}
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          hint="At least 8 characters."
          value={password}
          error={fieldErrors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Repeat the new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          error={fieldErrors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" loading={loading} className="w-full">
          Save new password
          {loading ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>
    </div>
  );
}
