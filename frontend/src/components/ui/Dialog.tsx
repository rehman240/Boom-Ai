"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Small modal: Escape and the backdrop close it, focus moves in on open and back to
 * whatever opened it on close.
 */
export function Dialog({
  title,
  description,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <h2 className="pr-10 font-display text-xl font-bold">{title}</h2>
        {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
