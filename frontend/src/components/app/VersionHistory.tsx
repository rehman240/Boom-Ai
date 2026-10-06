"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, History, RotateCcw } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import { listVersions, restoreVersion, revisionLabel, type Item, type Revision } from "@/lib/items";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Every saved version of one item, newest first, with Restore. Restoring adds a new
 * version (and keeps unsaved edits as their own), so nothing here can be lost.
 */
export function VersionHistory({
  projectId,
  item,
  title,
  preview,
  readOnly,
  onRestored,
  onClose,
}: {
  projectId: string;
  item: Item;
  title: string;
  preview: (data: Record<string, unknown>) => string;
  readOnly: boolean;
  onRestored: () => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Revision[] | null>(null);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listVersions(projectId, item.id)
      .then((v) => !cancelled && setVersions(v))
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load the history."));
    return () => {
      cancelled = true;
    };
  }, [projectId, item.id]);

  async function restore(number: number) {
    setError("");
    setRestoring(number);
    try {
      await restoreVersion(projectId, item.id, number);
      onRestored();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't restore that version. Please try again.");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Dialog
      title={`History: ${title}`}
      description="Every version is kept. Restoring one adds it as a new version, and any unsaved edits are kept first."
      onClose={onClose}
      wide
    >
      {error ? (
        <p className="mb-4 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}
      {versions === null && !error ? <p className="text-sm text-muted" role="status">Loading history…</p> : null}
      {versions ? (
        <ol className="space-y-3">
          {item.unsaved_changes ? (
            <li className="rounded-2xl border border-cyan/40 bg-primary/10 px-4 py-3">
              <p className="text-sm font-semibold text-cyan">Now: your edits (not saved as a version yet)</p>
              <p className="mt-1 text-sm text-muted">{preview(item.data)}</p>
            </li>
          ) : null}
          {versions.map((v) => {
            const current = v.number === item.version && !item.unsaved_changes;
            return (
              <li key={v.number} className="rounded-2xl border border-border bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                      <History className="h-4 w-4 text-subtle" aria-hidden="true" />
                      Version {v.number}
                      {v.label ? <span className="text-cyan">“{v.label}”</span> : null}
                      {current ? (
                        <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-sm text-success">Current</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-subtle">
                      {revisionLabel(v)} · {when(v.created_at)}
                      {v.model ? ` · ${v.provider === "mock" ? "test mode" : v.model}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{preview(v.data)}</p>
                  </div>
                  {!readOnly && !current ? (
                    <Button
                      variant="secondary"
                      className="h-10 px-4 text-sm"
                      onClick={() => restore(v.number)}
                      loading={restoring === v.number}
                      disabled={restoring !== null}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </Dialog>
  );
}
