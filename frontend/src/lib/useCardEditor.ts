"use client";

import { useRef, useState } from "react";
import { useAutosave } from "@/lib/useAutosave";

type Errors<T> = Partial<Record<keyof T, string>>;

/**
 * Editing an audience or direction card in place, saved as you type like the brief and the
 * creative assets. Only fields that differ from what was last sent are queued, and nothing is
 * sent while a required field is empty: the error shows instead, and the save follows the fix.
 * "Done" saves anything still waiting and closes the editor.
 */
export function useCardEditor<T extends object>({
  draft,
  clean = (d) => d,
  validate,
  save,
}: {
  draft: () => T;
  clean?: (d: T) => T;
  validate: (d: T) => Errors<T>;
  /** Saves the changed fields; throws with a message to show if it can't. */
  save: (changes: Partial<T>) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [errors, setErrors] = useState<Errors<T>>({});
  const sent = useRef<T | null>(null);
  const autosave = useAutosave<T>(save);

  function queueChanges(next: T) {
    const cleaned = clean(next);
    const found = validate(cleaned);
    setErrors(found);
    if (Object.keys(found).length || !sent.current) return;
    const before = sent.current;
    const changes = Object.fromEntries(
      Object.entries(cleaned).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k as keyof T])),
    ) as Partial<T>;
    if (!Object.keys(changes).length) return;
    sent.current = { ...before, ...changes };
    autosave.queue(changes);
  }

  return {
    editing,
    errors,
    status: autosave.status,
    error: autosave.error,
    retry: autosave.retry,
    open() {
      const d = draft();
      sent.current = d;
      setErrors({});
      setEditing(d);
    },
    change(next: T) {
      setEditing(next);
      queueChanges(next);
    },
    async done() {
      if (editing && Object.keys(validate(clean(editing))).length) return;
      if (await autosave.saveNow()) setEditing(null);
    },
  };
}
