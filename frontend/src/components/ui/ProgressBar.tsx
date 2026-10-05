export const STAGES = [
  { key: "brief", label: "Brief" },
  { key: "target", label: "Target" },
  { key: "campaign", label: "Campaign" },
  { key: "creative", label: "Creative" },
  { key: "budget", label: "Budget" },
  { key: "conversions", label: "Conversions" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"] | "review";

/**
 * 6-segment campaign progress. Segments up to and including the current stage are filled;
 * on "review" all six are filled. Labels show on wider screens, and screen readers get
 * the step text.
 */
export function ProgressBar({ stage }: { stage: StageKey }) {
  // An unknown stage falls back to the first one rather than breaking the page.
  const found = STAGES.findIndex((s) => s.key === stage) + 1;
  const current = stage === "review" ? STAGES.length : found || 1;
  const label = stage === "review" ? "All steps done, reviewing" : `Step ${current} of ${STAGES.length}: ${STAGES[current - 1].label}`;

  return (
    <div>
      <p className="sr-only">{label}</p>
      <ol className="grid grid-cols-6 gap-2" aria-hidden="true">
        {STAGES.map((s, i) => {
          const filled = i < current;
          return (
            <li key={s.key}>
              <div className={`h-1.5 rounded-full ${filled ? "bg-linear-to-r from-primary to-cyan" : "bg-surface-3"}`} />
              <span className={`mt-2 hidden text-sm font-medium md:block ${filled ? "text-muted" : "text-subtle"}`}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
