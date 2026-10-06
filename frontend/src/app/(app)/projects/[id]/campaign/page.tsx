"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, ChevronDown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { DirectionCard } from "@/components/app/DirectionCard";
import { CampaignUnavailable, StageHeader, useCampaign } from "@/components/app/StageHeader";
import { VersionHistory } from "@/components/app/VersionHistory";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ApiError } from "@/lib/api";
import { isActive, type Job } from "@/lib/brief";
import {
  generateDirections,
  getDirections,
  regenerateDirection,
  slotLetter,
  type Direction,
  type DirectionStage,
} from "@/lib/directions";
import { editItem, restoreVersion, selectItem } from "@/lib/items";

const POLL_MS = 2500;
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const newer = (a: Job | null | undefined, b: Job | null | undefined) => !b || (!!a && a.created_at > b.created_at);

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCampaign(id);
  const [stage, setStage] = useState<DirectionStage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [details, setDetails] = useState(false);
  const [history, setHistory] = useState<Direction | null>(null);
  const [replacing, setReplacing] = useState<Direction | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStage(await getDirections(id));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e, "Couldn't load the directions."));
    }
  }, [id]);

  useEffect(() => {
    // Loading data on mount; the state is set once the request comes back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Several generations can run at once (one per direction), so the whole stage is polled
  // while any of them is running. The jobs live on the server, so a refresh rejoins them.
  const wholeRunning = isActive(stage?.job);
  const runningSlots = Object.entries(stage?.slot_jobs ?? {})
    .filter(([, job]) => isActive(job))
    .map(([slot]) => slot);
  const anyRunning = wholeRunning || runningSlots.length > 0;

  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);

  const readOnly = load.status === "ready" && load.project.is_demo;

  async function act(key: string, run: () => Promise<unknown>, fallback: string) {
    setError("");
    setBusy(key);
    try {
      await run();
      await refresh();
      return true;
    } catch (e) {
      setError(message(e, fallback));
      return false;
    } finally {
      setBusy("");
    }
  }

  const generateAll = () => act("generate", () => generateDirections(id), "Couldn't start. Please try again.");
  const regenerate = (d: Direction) =>
    act(`regen-${d.slot}`, () => regenerateDirection(id, d.slot), "Couldn't start. Please try again.");

  if (load.status === "error") return <CampaignUnavailable message={load.message} />;

  const list = stage?.directions ?? [];
  const chosen = list.find((d) => d.selected);
  const failedWhole = stage?.job?.status === "failed" && !wholeRunning ? stage.job : null;

  /** A failed single-direction run, if it is the most recent thing that happened to that slot. */
  const slotError = (slot: string) => {
    const job = stage?.slot_jobs[slot];
    return job?.status === "failed" && newer(job, stage?.job) ? job.error ?? "" : "";
  };

  return (
    <>
      <StageHeader
        load={load}
        stage="campaign"
        eyebrow="03 / Generate campaign"
        title="Choose your campaign direction"
        subtitle="Three different ways to tell the story to your audience. Compare them, choose one, and edit it before assets are made."
      />

      {loadError ? (
        <Alert>
          {loadError}{" "}
          <button className="font-semibold underline underline-offset-4" onClick={refresh}>
            Try again
          </button>
        </Alert>
      ) : null}

      {!stage && !loadError ? (
        <p className="mt-10 flex items-center gap-2 text-muted" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading directions…
        </p>
      ) : null}

      {stage?.blocked_reason ? (
        <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <h2 className="font-display text-xl font-bold">First, choose who you are speaking to</h2>
          <p className="mt-2 max-w-xl text-muted">
            {stage.blocked_reason} Directions are written for one primary audience.
          </p>
          <ButtonLink href={`/projects/${id}/target`} className="mt-6">
            Go to Identify Target <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
        </section>
      ) : null}

      {stage && !stage.blocked_reason ? (
        <>
          {error ? <Alert>{error}</Alert> : null}
          {failedWhole ? (
            <Alert>
              {failedWhole.error} {list.length ? "Your directions are unchanged." : ""}
              {readOnly ? null : (
                <Button variant="secondary" className="mt-3 h-10 px-4 text-sm" onClick={generateAll} loading={busy === "generate"}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
                </Button>
              )}
            </Alert>
          ) : null}

          {wholeRunning ? (
            <section className="mt-10 rounded-3xl border border-cyan/40 bg-primary/10 p-6 sm:p-8" role="status" aria-live="polite">
              <p className="flex items-center gap-3 font-display text-xl font-bold">
                <Loader2 className="h-6 w-6 animate-spin text-cyan" aria-hidden="true" />
                {list.length ? "Writing new directions…" : "Writing your three directions…"}
              </p>
              <p className="mt-2 max-w-2xl text-muted">
                This usually takes under a minute. It keeps going if you leave or refresh this page.
                {list.length ? " Directions you chose or edited stay as they are." : ""}
              </p>
            </section>
          ) : null}

          {!list.length && !wholeRunning ? (
            <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Ready when you are
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">Three ways to tell your story</h2>
              <p className="mt-2 max-w-2xl text-muted">
                The AI writes three clearly different directions for your primary audience, each with a promise, an example
                headline, the channels it suits, its risks and what it is based on. Nothing is invented beyond your brief.
              </p>
              {readOnly ? null : (
                <Button onClick={generateAll} loading={busy === "generate"} className="mt-6">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Write three directions
                </Button>
              )}
            </section>
          ) : null}

          {list.length ? (
            <>
              <div className="mt-10 flex justify-end">
                <Button variant="ghost" onClick={() => setDetails((v) => !v)} aria-expanded={details}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${details ? "rotate-180" : ""}`} aria-hidden="true" />
                  {details ? "Hide full details" : "Show full details"}
                </Button>
              </div>
              <section aria-label="Campaign directions" className="mt-3 grid gap-5 lg:grid-cols-3">
                {list.map((d) => (
                  <DirectionCard
                    key={d.id}
                    direction={d}
                    details={details}
                    readOnly={readOnly}
                    busy={busy !== "" || wholeRunning}
                    rewriting={runningSlots.includes(d.slot)}
                    slotError={slotError(d.slot)}
                    onChoose={() => act(d.id, () => selectItem(id, d.id), "Couldn't choose this direction.")}
                    onSave={(changes) => act(d.id, () => editItem(id, d.id, changes), "Couldn't save your changes.")}
                    onUndo={() => act(d.id, () => restoreVersion(id, d.id, d.version), "Couldn't undo. Please try again.")}
                    onRegenerate={() => (d.selected || d.unsaved_changes ? setReplacing(d) : regenerate(d))}
                    onHistory={() => setHistory(d)}
                  />
                ))}
              </section>
            </>
          ) : null}

          {list.length && !readOnly ? (
            // Sticky on large screens only, with room on the right for the round audio guide
            // button. On phones it ends the page, with space below so the button never covers it.
            <div className="mt-8 mb-24 rounded-2xl border border-border bg-bg/95 px-4 py-4 lg:sticky lg:bottom-0 lg:z-10 lg:mb-0 lg:pr-24 lg:backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted" role="status">
                    {chosen ? (
                      <>
                        Chosen: <span className="font-semibold text-text">{chosen.data.name}</span>
                      </>
                    ) : (
                      "Choose one direction to continue."
                    )}
                  </p>
                  <p className="mt-1 text-sm text-subtle">
                    New directions replace only those you haven&apos;t chosen or edited. Replaced ones stay in their history.
                  </p>
                </div>
                <div className="flex flex-col gap-3 whitespace-nowrap sm:shrink-0 sm:flex-row">
                  <Button variant="secondary" onClick={generateAll} loading={busy === "generate"} disabled={anyRunning}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> New directions
                  </Button>
                  {chosen ? (
                    <ButtonLink href={`/projects/${id}/creative`}>
                      Build assets <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </ButtonLink>
                  ) : (
                    <Button disabled>
                      Build assets <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {history ? (
        <VersionHistory
          projectId={id}
          item={history}
          title={`Direction ${slotLetter(history.slot)}`}
          preview={(data) => [data.name, data.promise].filter(Boolean).join(": ")}
          readOnly={readOnly}
          onRestored={refresh}
          onClose={() => setHistory(null)}
        />
      ) : null}

      {replacing ? (
        <Dialog
          title={`Replace direction ${slotLetter(replacing.slot)}?`}
          description={`${
            replacing.selected ? "This is your chosen direction. " : ""
          }A new idea takes its place. The current text, including your edits, stays in its history and can be restored.`}
          onClose={() => setReplacing(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setReplacing(null)}>
              Keep it
            </Button>
            <Button
              onClick={async () => {
                const target = replacing;
                setReplacing(null);
                await regenerate(target);
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Write a new one
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
