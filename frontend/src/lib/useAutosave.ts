"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DELAY_MS = 900;

/**
 * Queues field changes and saves them a moment after typing stops.
 *
 * Only the fields that changed are sent, and a failed save keeps its fields queued so
 * the next edit retries them: a save that goes wrong must never lose what was typed.
 */
export function useAutosave<T extends object>(save: (changes: Partial<T>) => Promise<unknown>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");

  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // Kept in a ref so the queue and flush callbacks never go stale.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(async () => {
    if (inFlight.current) return; // the running save picks up anything queued since
    if (Object.keys(pending.current).length === 0) return;

    inFlight.current = true;
    try {
      // Loop rather than schedule another pass: edits made while a save is in flight
      // are sent straight after it, so nothing waits for the next keystroke.
      while (Object.keys(pending.current).length > 0) {
        const changes = pending.current;
        pending.current = {};
        setStatus("saving");
        try {
          await saveRef.current(changes);
          setError("");
        } catch (e) {
          // Put the unsaved fields back, without overwriting anything typed since.
          pending.current = { ...changes, ...pending.current };
          setError(e instanceof Error ? e.message : "Couldn't save. We'll try again.");
          setStatus("error");
          return;
        }
      }
      setStatus("saved");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const queue = useCallback(
    (changes: Partial<T>) => {
      pending.current = { ...pending.current, ...changes };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DELAY_MS);
    },
    [flush],
  );

  /** Save anything queued right away. Resolves true once nothing is left unsaved. */
  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    while (inFlight.current) await new Promise((r) => setTimeout(r, 50));
    await flush();
    return Object.keys(pending.current).length === 0;
  }, [flush]);

  useEffect(() => {
    // Leaving the tab is a likely moment to close it, so save now rather than in a second.
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
      // Navigating away: send whatever is queued. Nothing is left to update here.
      const changes = pending.current;
      if (Object.keys(changes).length > 0) saveRef.current(changes).catch(() => undefined);
    };
  }, [flush]);

  return { status, error, queue, retry: flush, saveNow };
}
