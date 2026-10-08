import { Check, CloudOff, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/lib/useAutosave";

/** "Saving…", "Saved", or the error with a Retry, for anything that saves as you type. */
export function SaveState({ status, error, retry }: { status: SaveStatus; error: string; retry: () => void }) {
  if (status === "error") {
    return (
      <span className="flex items-center gap-2 text-sm text-danger" role="alert">
        <CloudOff className="h-4 w-4" aria-hidden="true" /> {error || "Not saved."}
        <button onClick={retry} className="font-semibold underline underline-offset-2">
          Retry
        </button>
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="flex items-center gap-2 text-sm text-subtle" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-subtle" role="status">
        <Check className="h-4 w-4" aria-hidden="true" /> Saved
      </span>
    );
  }
  return null;
}
