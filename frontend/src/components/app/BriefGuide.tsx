"use client";

import { ArrowDown, Check } from "lucide-react";
import { REQUIRED_LABELS, type BriefDraft } from "@/lib/brief";

/** Required fields the person has not filled in yet, in the order they appear in the form. */
export function missingFields(draft: BriefDraft): string[] {
  return Object.keys(REQUIRED_LABELS).filter((key) => !String(draft[key as keyof BriefDraft] ?? "").trim());
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** Brings a form field into the middle of the screen and puts the cursor in it. */
export function goToField(name: string) {
  // Form controls only: the page head also has a <meta name="description">.
  const el = document.querySelector<HTMLElement>(
    `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`,
  );
  if (!el) return;
  el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  el.focus({ preventScroll: true });
}

export function goToElement(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  el.querySelector<HTMLElement>("button:not([disabled]), a")?.focus({ preventScroll: true });
}

/**
 * A bar fixed to the bottom of the screen on phones and tablets: how far along the brief is,
 * and one large button that jumps to the next field to fill in. On wide screens the checklist
 * beside the form does the same job.
 */
export function BriefGuide({ missing, reviewId }: { missing: string[]; reviewId: string }) {
  const total = Object.keys(REQUIRED_LABELS).length;
  const done = total - missing.length;
  const next = missing[0];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-strong bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-16 flex-1" aria-live="polite">
          <p className="whitespace-nowrap text-base font-semibold text-text">
            {done} of {total} done
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
        {next ? (
          <button
            type="button"
            onClick={() => goToField(next)}
            className="flex min-h-14 max-w-[65%] items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-left text-lg leading-tight font-semibold text-white"
          >
            <span>
              <span className="sr-only">Go to the next field: </span>Next: {REQUIRED_LABELS[next]}
            </span>
            <ArrowDown className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goToElement(reviewId)}
            className="flex h-14 shrink-0 items-center gap-2 rounded-2xl bg-success px-5 text-lg font-semibold text-[#062014]"
          >
            <Check className="h-5 w-5" aria-hidden="true" /> All set: review brief
          </button>
        )}
      </div>
    </div>
  );
}
