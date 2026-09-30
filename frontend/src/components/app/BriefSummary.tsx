"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, CircleHelp, RefreshCw, Sparkles } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import {
  SOURCE_LABELS,
  confirmSummary,
  getBrief,
  getJob,
  isActive,
  startSummary,
  type BriefState,
  type Job,
  type Summary,
} from "@/lib/brief";

const POLL_MS = 1500;

/**
 * State for the brief's AI summary: the stored summary, the latest generation job, and
 * polling while that job runs. The job lives on the server, so a refresh picks it up again.
 */
export function useBriefSummary(projectId: string) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "starting" | "confirming">("");
  // Set when a job we were watching finishes, so the panel can take focus once.
  const [justFinished, setJustFinished] = useState(false);

  const sync = useCallback((state: BriefState) => {
    setSummary(state.summary);
    setJob(state.summary_job);
  }, []);

  const jobId = job?.id;
  const active = isActive(job);

  useEffect(() => {
    if (!active || !jobId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const next = await getJob(projectId, jobId);
        if (cancelled || isActive(next)) return;
        if (next.status === "succeeded") {
          const state = await getBrief(projectId);
          if (cancelled) return;
          sync(state);
          setJustFinished(true);
        } else {
          setJob(next);
        }
      } catch {
        // A dropped poll is retried on the next tick; the job keeps running on the server.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, jobId, projectId, sync]);

  /** `beforeStart` saves pending edits first, so the summary is made from what's on screen. */
  async function start(beforeStart?: () => Promise<boolean>) {
    setError("");
    setBusy("starting");
    try {
      if (beforeStart && !(await beforeStart())) {
        setError("Your latest changes aren't saved yet. Retry the save, then try again.");
        return;
      }
      setJob(await startSummary(projectId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the summary. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function confirm() {
    setError("");
    setBusy("confirming");
    try {
      sync(await confirmSummary(projectId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't confirm. Please try again.");
    } finally {
      setBusy("");
    }
  }

  return { summary, job, error, busy, active, justFinished, clearJustFinished: () => setJustFinished(false), sync, start, confirm };
}

export type BriefSummaryState = Omit<ReturnType<typeof useBriefSummary>, "start"> & { start: () => void };

/** The card under the checklist: what happens next, and the button for it. */
export function SummaryAction({
  s,
  projectId,
  ready,
  missingCount,
  readOnly,
}: {
  s: BriefSummaryState;
  projectId: string;
  ready: boolean;
  missingCount: number;
  readOnly: boolean;
}) {
  const failed = s.job?.status === "failed" ? s.job : null;
  const status = s.summary?.status;

  let body: ReactNode;
  if (readOnly) {
    body = <p className="text-sm text-muted">The example campaign can&apos;t generate a summary.</p>;
  } else if (s.active) {
    body = (
      <>
        <Button className="w-full" loading disabled>
          Reading your brief…
        </Button>
        <p className="mt-3 text-xs text-subtle" role="status">
          This usually takes under a minute. It keeps going if you leave or refresh the page.
        </p>
      </>
    );
  } else if (status === "confirmed") {
    body = (
      <>
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <Check className="h-4 w-4" aria-hidden="true" /> Facts confirmed
        </p>
        <ButtonLink href={`/projects/${projectId}/target`} className="mt-4 w-full">
          Continue to Identify Target <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </>
    );
  } else if (status === "ready") {
    body = (
      <>
        <p className="text-sm text-muted">The summary is ready. Check the facts below, then confirm them.</p>
        <ButtonLink href="#brief-summary" className="mt-4 w-full">
          Review summary <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </>
    );
  } else {
    const outdated = status === "outdated";
    body = (
      <>
        {outdated ? (
          <p className="mb-4 text-sm text-muted">You changed the brief after the summary was made. Refresh it to confirm.</p>
        ) : null}
        <Button
          className="w-full"
          onClick={s.start}
          loading={s.busy === "starting"}
          disabled={!ready}
          title={ready ? undefined : "Fill in the required fields first"}
        >
          {outdated ? "Refresh summary" : failed ? "Try again" : "Review brief"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="mt-3 text-xs text-subtle">
          {ready
            ? "BOOOM More summarises your brief so you can check the facts before any ideas are generated."
            : `${missingCount} required ${missingCount === 1 ? "field" : "fields"} still to fill in.`}
        </p>
      </>
    );
  }

  const shownError = s.error || (failed && !s.active ? failed.error : "");
  return (
    <div className="rounded-3xl border border-border bg-surface p-6">
      {shownError ? (
        <p className="mb-4 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {shownError}
            {s.summary ? " Your previous summary is kept." : ""}
          </span>
        </p>
      ) : null}
      {body}
    </div>
  );
}

const STATUS_BADGE = {
  ready: { text: "Needs your check", className: "border-warning/40 bg-warning/10 text-warning", Icon: CircleHelp },
  confirmed: { text: "Confirmed", className: "border-success/40 bg-success/10 text-success", Icon: Check },
  outdated: { text: "Outdated", className: "border-border-strong bg-surface-2 text-muted", Icon: RefreshCw },
} as const;

const FLAG_LABELS: Record<string, string> = {
  health: "Health claim",
  finance: "Financial claim",
  performance: "Performance claim",
  legal: "Legal",
  other: "Check this",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The full summary, shown under the form once there is one. */
export function SummaryPanel({ s, projectId, readOnly }: { s: BriefSummaryState; projectId: string; readOnly: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { justFinished, clearJustFinished } = s;

  useEffect(() => {
    if (!justFinished) return;
    // The section carries the scroll margin that keeps it clear of the sticky top bar.
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    headingRef.current?.focus({ preventScroll: true });
    clearJustFinished();
  }, [justFinished, clearJustFinished]);

  const summary = s.summary;
  if (!summary) return null;
  const { data, status } = summary;
  const badge = STATUS_BADGE[status];

  return (
    <section ref={sectionRef} id="brief-summary" className="mt-4 scroll-mt-20 rounded-3xl border border-border bg-surface p-6 sm:p-8" aria-labelledby="brief-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI summary
          </p>
          <h2 id="brief-summary-title" ref={headingRef} tabIndex={-1} className="mt-2 font-display text-xl font-bold outline-none">
            Check the facts before generating
          </h2>
          <p className="mt-1 text-xs text-subtle">
            Made {formatDate(summary.generated_at)} · {summary.provider === "mock" ? "test mode (no AI model)" : summary.model} ·{" "}
            {summary.prompt_version}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>
          <badge.Icon className="h-3.5 w-3.5" aria-hidden="true" /> {badge.text}
        </span>
      </div>

      {status === "outdated" ? (
        <p className="mt-5 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-sm text-muted">
          The brief changed after this summary was made, so it may not match any more. Refresh it from the panel beside the form.
        </p>
      ) : null}

      <p className="mt-6 text-base leading-relaxed text-text">{data.overview}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <KeyCard title="Offer">{data.offer}</KeyCard>
        <KeyCard title="Conversion goal">{data.conversion_goal}</KeyCard>
        <KeyCard title="Audience limits">
          <ul className="space-y-1">
            {data.audience_constraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </KeyCard>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h3 className="text-sm font-semibold text-text">Facts from your brief</h3>
          <dl className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {data.facts.map((f, i) => (
              <div key={`${f.source}-${i}`} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="text-sm text-subtle">{f.label}</dt>
                <dd className="text-sm text-text">
                  {f.value}
                  <span className="mt-1 block text-xs text-subtle">Based on: {SOURCE_LABELS[f.source] ?? f.source}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {data.review_flags.length ? (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Needs human review
              </h3>
              <ul className="mt-3 space-y-3">
                {data.review_flags.map((f, i) => (
                  <li key={i} className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning">{FLAG_LABELS[f.category] ?? f.category}</p>
                    <p className="mt-1 text-text">&ldquo;{f.claim}&rdquo;</p>
                    <p className="mt-1 text-muted">{f.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ListBlock title="Worth adding" empty="Nothing essential is missing." items={data.missing_info} />
          <ListBlock
            title="Assumptions"
            note="Inferred, not stated in your brief."
            empty="Nothing was assumed."
            items={data.assumptions}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Something wrong? Fix it in the brief above. The summary is always rebuilt from your brief.
        </p>
        {readOnly ? null : status === "confirmed" ? (
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <Check className="h-4 w-4" aria-hidden="true" /> You confirmed these facts
            </p>
            <ButtonLink href={`/projects/${projectId}/target`}>
              Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        ) : (
          <div className="flex shrink-0 gap-3">
            <Button variant="secondary" onClick={s.start} loading={s.busy === "starting"} disabled={s.active}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> {status === "outdated" ? "Refresh" : "Regenerate"}
            </Button>
            <Button onClick={s.confirm} loading={s.busy === "confirming"} disabled={status === "outdated" || s.active}>
              <Check className="h-4 w-4" aria-hidden="true" /> Confirm facts
            </Button>
          </div>
        )}
      </div>
      {s.error && !readOnly ? (
        <p className="mt-3 text-sm text-danger">
          {s.error}
        </p>
      ) : null}
    </section>
  );
}

function KeyCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">{title}</p>
      <div className="mt-2 text-sm text-text">{children}</div>
    </div>
  );
}

function ListBlock({ title, note, empty, items }: { title: string; note?: string; empty: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {note ? <p className="text-xs text-subtle">{note}</p> : null}
      {items.length ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-subtle">{empty}</p>
      )}
    </div>
  );
}
