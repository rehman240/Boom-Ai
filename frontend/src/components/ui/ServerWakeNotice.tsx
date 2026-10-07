"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

// A healthy server answers well inside this; anything slower is the free host starting up.
const SLOW_AFTER_MS = 3000;

/**
 * The backend host puts the server to sleep when nobody has used it for a while, and the
 * first request then takes up to a minute. This pings it as soon as any page opens, so it
 * is usually awake by the time someone signs in, and says plainly what is happening if
 * the wait is long, so a slow first load doesn't look like a broken app.
 */
export function ServerWakeNotice() {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    let done = false;
    const timer = setTimeout(() => !done && setWaking(true), SLOW_AFTER_MS);
    fetch("/api/health", { cache: "no-store" })
      .catch(() => {})
      .finally(() => {
        done = true;
        clearTimeout(timer);
        setWaking(false);
      });
    return () => clearTimeout(timer);
  }, []);

  if (!waking) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-lg sm:bottom-6"
    >
      <LoaderCircle className="mt-0.5 h-6 w-6 shrink-0 animate-spin text-cyan" aria-hidden="true" />
      <p className="text-text">
        <span className="block font-semibold">Starting up, one moment…</span>
        <span className="block text-muted">The first visit after a quiet spell can take up to a minute.</span>
      </p>
    </div>
  );
}
