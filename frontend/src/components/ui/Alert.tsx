import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** An error the user should see and can usually act on. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-base text-danger" role="alert">
      <AlertTriangle className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
