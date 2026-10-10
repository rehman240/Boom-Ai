"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  History,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { NameVersion } from "@/components/app/AssetEditor";
import { CampaignUnavailable, StageHeader, useCampaign } from "@/components/app/StageHeader";
import { VersionHistory } from "@/components/app/VersionHistory";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SaveState } from "@/components/ui/SaveState";
import { ApiError } from "@/lib/api";
import { approveAsset, unapproveAsset } from "@/lib/assets";
import { isActive } from "@/lib/brief";
import {
  MAX_LINES,
  MAX_PRODUCTION,
  addLine,
  campaignDays,
  changeLine,
  fitToBrief,
  generateBudget,
  getBudget,
  inputValue,
  money,
  parseMoney,
  removeLine,
  resetSuggestion,
  type BudgetData,
  type BudgetLine,
  type BudgetPlan,
  type BudgetStage,
  type ProductionLine,
} from "@/lib/budget";
import { FLAG_LABELS, editItem, saveVersion } from "@/lib/items";
import { useAutosave } from "@/lib/useAutosave";

const POLL_MS = 2500;
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const newId = () => Math.random().toString(16).slice(2, 14);

export default function BudgetPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCampaign(id);
  const [stage, setStage] = useState<BudgetStage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [history, setHistory] = useState(false);
  const [naming, setNaming] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStage(await getBudget(id));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e, "Couldn't load the budget."));
    }
  }, [id]);

  useEffect(() => {
    // Loading data on mount; the state is set once the request comes back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // The job lives on the server, so a refresh rejoins it; the page polls while it runs.
  const running = isActive(stage?.job);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  /** A line change came back: show the server's plan, which did the rebalancing. */
  const onPlan = useCallback((plan: BudgetPlan) => setStage((s) => s && { ...s, plan }), []);

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

  const generate = () => act("generate", () => generateBudget(id), "Couldn't start. Please try again.");

  if (load.status === "error") return <CampaignUnavailable message={load.message} />;

  const readOnly = load.status === "ready" && load.project.is_demo;
  const plan = stage?.plan ?? null;
  const failed = stage?.job?.status === "failed" && !running ? stage.job : null;
  const approved = !!plan?.approved_at;
  const locked = readOnly || approved;

  return (
    <>
      <StageHeader
        load={load}
        stage="budget"
        eyebrow="05 / Allocate budget"
        title="Put the budget to work"
        subtitle="Adjust the mix. Channel amounts always add up to your media budget. Lock a channel to keep it while the rest moves."
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
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading the budget…
        </p>
      ) : null}

      {stage?.blocked_reason ? (
        <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <h2 className="font-display text-xl font-bold">
            {stage.blocked_reason.includes("budget") ? "First, add your budget" : "First, choose a campaign direction"}
          </h2>
          <p className="mt-2 max-w-xl text-muted">
            {stage.blocked_reason} The split is planned for your chosen direction and the budget in your brief.
          </p>
          <ButtonLink
            href={`/projects/${id}/${stage.blocked_reason.includes("budget") ? "brief" : "campaign"}`}
            className="mt-6"
          >
            {stage.blocked_reason.includes("budget") ? "Go to the brief" : "Go to Generate Campaign"}{" "}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
        </section>
      ) : null}

      {stage && !stage.blocked_reason ? (
        <>
          {error ? <Alert>{error}</Alert> : null}
          {failed ? (
            <Alert>
              {failed.error} {plan ? "Your budget is unchanged." : ""}
              {readOnly ? null : (
                <Button variant="secondary" className="mt-3 h-10 px-4 text-sm" onClick={generate} loading={busy === "generate"}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
                </Button>
              )}
            </Alert>
          ) : null}

          {running ? (
            <section className="mt-10 rounded-3xl border border-cyan/40 bg-primary/10 p-6 sm:p-8" role="status" aria-live="polite">
              <p className="flex items-center gap-3 font-display text-xl font-bold">
                <Loader2 className="h-6 w-6 animate-spin text-cyan" aria-hidden="true" />
                {plan ? "Suggesting a new mix…" : "Suggesting your channel mix…"}
              </p>
              <p className="mt-2 max-w-2xl text-muted">
                This usually takes under a minute. It keeps going if you leave or refresh this page.
                {plan ? " Your current plan stays in its history." : ""}
              </p>
            </section>
          ) : null}

          {!plan && !running ? (
            <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Ready when you are
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">Split {money(stage.total_cents)} across your channels</h2>
              <p className="mt-2 max-w-2xl text-muted">
                The AI suggests which channels to use and each one&apos;s share, with the reasons and what it assumed. The app
                works out the amounts, so they always add up to your budget. There are no forecasts or promised results.
              </p>
              {readOnly ? null : (
                <Button onClick={generate} loading={busy === "generate"} className="mt-6">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Suggest a budget split
                </Button>
              )}
            </section>
          ) : null}

          {plan ? (
            <>
              {approved ? (
                <p className="mt-8 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Approved. It is locked so nothing changes it by accident. Unapprove it to edit.
                </p>
              ) : null}
              {plan.total_changed ? (
                <div className="mt-8 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Your brief now says {money(stage.total_cents)}, but this plan splits {money(plan.data.total_cents)}.
                  </p>
                  {locked ? null : (
                    <Button
                      variant="secondary"
                      className="h-10 shrink-0 px-4 text-sm"
                      onClick={() => act("fit", () => fitToBrief(id), "Couldn't update the plan.")}
                      loading={busy === "fit"}
                    >
                      Fit to {money(stage.total_cents)}
                    </Button>
                  )}
                </div>
              ) : null}
              {plan.outdated && !plan.total_changed ? (
                <p className="mt-8 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Suggested for an earlier version of your brief or direction. Check it, or ask for a new suggestion.
                </p>
              ) : null}

              <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <ChannelMix
                  projectId={id}
                  stage={stage}
                  plan={plan}
                  locked={locked}
                  onPlan={onPlan}
                />
                <div className="space-y-5">
                  <WhyThisMix data={plan.data} flags={plan.review_flags} />
                  <ProductionCosts key={plan.id + plan.version} projectId={id} plan={plan} locked={locked} />
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button variant="secondary" onClick={() => setHistory(true)} disabled={busy !== ""}>
                  <History className="h-4 w-4" aria-hidden="true" /> Versions
                </Button>
                {locked ? null : (
                  <>
                    <Button variant="secondary" onClick={() => setNaming(true)} disabled={busy !== ""}>
                      <Save className="h-4 w-4" aria-hidden="true" /> Save version
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => act("reset", () => resetSuggestion(id), "Couldn't reset. Please try again.")}
                      loading={busy === "reset"}
                      disabled={busy !== "" && busy !== "reset"}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset suggestion
                    </Button>
                    <Button variant="secondary" onClick={() => setReplacing(true)} disabled={busy !== "" || running}>
                      <RefreshCw className="h-4 w-4" aria-hidden="true" /> New suggestion
                    </Button>
                  </>
                )}
              </div>

              {readOnly ? null : (
                // Sticky on large screens only, with room on the right for the round audio guide
                // button. On phones it ends the page, with space below so the button never covers it.
                <div className="mt-8 mb-24 rounded-2xl border border-border bg-bg/95 px-4 py-4 lg:sticky lg:bottom-0 lg:z-10 lg:mb-0 lg:pr-24 lg:backdrop-blur">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-muted" role="status">
                        <span className="font-semibold text-text">
                          {approved ? "Budget approved." : "Not approved yet."}
                        </span>{" "}
                        Version {plan.version}
                        {plan.unsaved_changes ? ", edited" : ""}.
                      </p>
                      <p className="mt-1 text-sm text-subtle">
                        {approved ? "Unapprove it to make changes." : "Changes save as you go. Approve the budget when it looks right."}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 whitespace-nowrap sm:shrink-0 sm:flex-row">
                      {approved ? (
                        <Button
                          variant="secondary"
                          onClick={() => act("approve", () => unapproveAsset(id, plan.id), "Couldn't unapprove.")}
                          loading={busy === "approve"}
                        >
                          Unapprove to edit
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => act("approve", () => approveAsset(id, plan.id), "Couldn't approve.")}
                          loading={busy === "approve"}
                          disabled={busy !== "" && busy !== "approve"}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" /> Approve budget
                        </Button>
                      )}
                      <ButtonLink href={`/projects/${id}/conversions`}>
                        Continue to conversions <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {history && plan ? (
        <VersionHistory
          projectId={id}
          item={plan}
          title="Budget"
          preview={(d) =>
            ((d as BudgetData).lines ?? []).map((l) => `${l.channel} ${money(l.amount_cents)}`).join(" · ")
          }
          readOnly={locked}
          onRestored={refresh}
          onClose={() => setHistory(false)}
        />
      ) : null}

      {naming && plan ? (
        <NameVersion
          onClose={() => setNaming(false)}
          onSave={async (label) => {
            await act("version", () => saveVersion(id, plan.id, label), "Couldn't save the version.");
            setNaming(false);
          }}
          saving={busy === "version"}
        />
      ) : null}

      {replacing ? (
        <Dialog
          title="Get a new suggestion?"
          description="The AI suggests a new mix for your budget. The current plan, including your changes, stays in its history and can be restored. Production costs you entered are kept."
          onClose={() => setReplacing(false)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setReplacing(false)}>
              Keep this plan
            </Button>
            <Button
              onClick={async () => {
                setReplacing(false);
                await generate();
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Suggest a new mix
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/** The channel lines, the two headline figures and the "allocated" check. */
function ChannelMix({
  projectId,
  stage,
  plan,
  locked,
  onPlan,
}: {
  projectId: string;
  stage: BudgetStage;
  plan: BudgetPlan;
  locked: boolean;
  onPlan: (plan: BudgetPlan) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);
  const lines = plan.data.lines;
  const total = plan.data.total_cents;
  const allocated = lines.reduce((sum, l) => sum + l.amount_cents, 0);
  const days = campaignDays(stage.start_date, stage.end_date);

  async function run(key: string, call: () => Promise<BudgetPlan>) {
    setError("");
    setBusy(key);
    try {
      onPlan(await call());
      return true;
    } catch (e) {
      setError(message(e, "Couldn't change the budget. Please try again."));
      return false;
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="mix-title" className="min-w-0 rounded-3xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mix-title" className="font-display text-2xl font-bold">
          Recommended channel mix
        </h2>
        <span className="rounded-full border border-cyan/40 bg-primary/15 px-3 py-1 text-sm font-semibold text-cyan">
          {locked ? "Locked" : "Editable plan"}
        </span>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border-strong p-4">
          <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-subtle">Total media budget</dt>
          <dd className="mt-1 font-display text-3xl font-bold">{money(total)}</dd>
        </div>
        <div className="rounded-2xl border border-border-strong p-4">
          <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-subtle">Campaign length</dt>
          <dd className="mt-1 font-display text-3xl font-bold">{days ? `${days} ${days === 1 ? "day" : "days"}` : "Not set"}</dd>
        </div>
      </dl>

      {error ? (
        <p className="mt-5 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}

      <ul className="mt-6 space-y-6">
        {lines.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            percent={plan.percents[line.id] ?? 0}
            locked={locked}
            busy={busy !== ""}
            saving={busy === line.id}
            canRemove={lines.length > 1}
            onAmount={(cents) => run(line.id, () => changeLine(projectId, line.id, { amount_cents: cents }))}
            onLock={() => run(line.id, () => changeLine(projectId, line.id, { locked: !line.locked }))}
            onRemove={() => run(line.id, () => removeLine(projectId, line.id))}
          />
        ))}
      </ul>

      {!locked && lines.length < MAX_LINES ? (
        adding ? (
          <AddChannel
            options={stage.channels.filter((c) => !lines.some((l) => l.channel.toLowerCase() === c.toLowerCase()))}
            saving={busy === "add"}
            onCancel={() => setAdding(false)}
            onAdd={async (channel) => {
              if (await run("add", () => addLine(projectId, channel))) setAdding(false);
            }}
          />
        ) : (
          <Button variant="ghost" className="mt-5" onClick={() => setAdding(true)} disabled={busy !== ""}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add a channel
          </Button>
        )
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <span className="text-muted">Allocated</span>
        <span className={`font-semibold ${allocated === total ? "text-success" : "text-danger"}`} role="status">
          {money(allocated)} / {money(total)} {allocated === total ? <Check className="inline h-4 w-4" aria-label="adds up" /> : null}
        </span>
      </div>
    </section>
  );
}

function LineRow({
  line,
  percent,
  locked,
  busy,
  saving,
  canRemove,
  onAmount,
  onLock,
  onRemove,
}: {
  line: BudgetLine;
  percent: number;
  locked: boolean;
  busy: boolean;
  saving: boolean;
  canRemove: boolean;
  onAmount: (cents: number) => Promise<boolean>;
  onLock: () => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(inputValue(line.amount_cents));
  const [invalid, setInvalid] = useState(false);
  // Enter disables the box while it saves, which also blurs it; this stops a second send.
  const sending = useRef(false);
  const inputId = `amount-${line.id}`;

  // The server rebalanced this line after another one changed: show the new amount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(inputValue(line.amount_cents));
    setInvalid(false);
  }, [line.amount_cents]);

  async function commit() {
    const cents = parseMoney(text);
    if (cents === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (cents === line.amount_cents || sending.current) return;
    sending.current = true;
    try {
      // A refused change (more than the budget) puts the old amount back.
      if (!(await onAmount(cents))) setText(inputValue(line.amount_cents));
    } finally {
      sending.current = false;
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    commit();
  }

  return (
    <li>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-56 items-start justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor={inputId} className="block text-lg font-semibold">
              {line.channel}
            </label>
            {line.role ? <p className="text-sm text-muted">{line.role}</p> : null}
          </div>
          <span className="shrink-0 pt-1 font-semibold text-cyan sm:pt-3" aria-label={`${percent} percent`}>
            {percent}%
          </span>
        </div>
        <form onSubmit={submit} className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true">
              $
            </span>
            <input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              value={text}
              disabled={locked || busy}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${inputId}-error` : undefined}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              className={
                "h-12 w-full rounded-xl border bg-bg/60 pr-3 pl-7 sm:w-36 text-lg text-text tabular-nums focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none disabled:opacity-60 " +
                (invalid ? "border-danger" : "border-border-strong")
              }
            />
          </div>
          {locked ? null : (
            <>
              <button
                type="button"
                onClick={onLock}
                disabled={busy}
                aria-pressed={line.locked}
                aria-label={line.locked ? `Unlock ${line.channel}` : `Lock ${line.channel}`}
                title={line.locked ? "Locked: it keeps its amount when others change" : "Lock this amount"}
                className={
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 " +
                  (line.locked ? "border-cyan bg-primary/20 text-cyan" : "border-border-strong text-muted hover:text-text")
                }
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : line.locked ? (
                  <Lock className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <LockOpen className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              {canRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={busy}
                  aria-label={`Remove ${line.channel}`}
                  title="Remove this channel. Its amount moves to the unlocked ones."
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border-strong text-muted transition-colors hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </form>
      </div>
      {invalid ? (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-danger">
          Enter an amount in dollars, for example 2500 or 2500.50.
        </p>
      ) : null}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </li>
  );
}

function AddChannel({
  options,
  saving,
  onAdd,
  onCancel,
}: {
  options: string[];
  saving: boolean;
  onAdd: (channel: string) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState(options[0] ?? "other");
  const [other, setOther] = useState("");
  const channel = choice === "other" ? other.trim() : choice;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (channel) onAdd(channel);
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-border-strong p-4">
      <label htmlFor="new-channel" className="block text-lg font-semibold">
        Add a channel
      </label>
      <p className="text-sm text-muted">It starts at $0. Give it an amount and the unlocked channels make room.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <select
          id="new-channel"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="h-12 rounded-xl border border-border-strong bg-bg/60 px-3 text-lg text-text focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none"
        >
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="other">Other…</option>
        </select>
        {choice === "other" ? (
          <input
            aria-label="Channel name"
            maxLength={40}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="For example: Local radio"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border-strong bg-bg/60 px-4 text-lg text-text focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none"
          />
        ) : null}
      </div>
      <div className="mt-4 flex gap-3">
        <Button type="submit" loading={saving} disabled={!channel}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The AI's reasoning, assumptions and "based on", plus any claims to check. */
function WhyThisMix({ data, flags }: { data: BudgetData; flags: BudgetPlan["review_flags"] }) {
  return (
    <section aria-labelledby="why-title" className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">Why this mix?</p>
      <h2 id="why-title" className="mt-1 font-display text-xl font-bold">
        The reasoning
      </h2>
      <p className="mt-3 text-muted">{data.reasoning || "No reasoning was given."}</p>
      {data.assumptions.length ? (
        <>
          <h3 className="mt-5 border-t border-border pt-4 text-sm font-semibold uppercase tracking-[0.14em] text-subtle">
            Assumptions
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            {data.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      ) : null}
      {data.based_on.length ? (
        <>
          <h3 className="mt-5 border-t border-border pt-4 text-sm font-semibold uppercase tracking-[0.14em] text-subtle">
            Based on your brief
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {data.based_on.map((b, i) => (
              <li key={i}>
                <span className="font-semibold text-text">{b.source.replaceAll("_", " ")}:</span> {b.detail}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {flags.length ? (
        <ul className="mt-5 space-y-2">
          {flags.map((f, i) => (
            <li key={i} className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-semibold uppercase tracking-wide text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {FLAG_LABELS[f.category] ?? f.category}
              </p>
              <p className="mt-1 text-text">“{f.claim}”</p>
              <p className="mt-1 text-muted">{f.reason}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Production costs: the user's own figures, kept apart from the media budget. Saves as you type. */
function ProductionCosts({
  projectId,
  plan,
  locked,
}: {
  projectId: string;
  plan: BudgetPlan;
  locked: boolean;
}) {
  const [rows, setRows] = useState<ProductionLine[]>(plan.data.production);
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.data.production.map((p) => [p.id, inputValue(p.amount_cents)])),
  );
  const autosave = useAutosave<{ production: ProductionLine[] }>(async (changes) => {
    await editItem(projectId, plan.id, changes);
  });
  const total = rows.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  const missing = rows.filter((p) => p.amount_cents === null).length;

  function update(next: ProductionLine[]) {
    setRows(next);
    autosave.queue({ production: next });
  }

  function setAmount(row: ProductionLine, text: string) {
    setTexts((t) => ({ ...t, [row.id]: text }));
    const cents = text.trim() === "" ? null : parseMoney(text);
    if (text.trim() !== "" && cents === null) return; // not an amount yet; the field says so
    update(rows.map((p) => (p.id === row.id ? { ...p, amount_cents: cents } : p)));
  }

  return (
    <section aria-labelledby="production-title" className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">Production costs</p>
          <h2 id="production-title" className="mt-1 font-display text-xl font-bold">
            Separate from media
          </h2>
        </div>
        <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} />
      </div>
      <p className="mt-2 text-sm text-muted">
        What it costs to make the ads, such as photos or a video. Enter your own figures; they are not part of the media
        budget.
      </p>
      {rows.length ? (
        <ul className="mt-4 space-y-3">
          {rows.map((row, i) => {
            const text = texts[row.id] ?? "";
            const bad = text.trim() !== "" && parseMoney(text) === null;
            return (
              <li key={row.id} className="rounded-2xl border border-border-strong p-3">
                <label htmlFor={`prod-item-${row.id}`} className="sr-only">
                  Production item {i + 1}
                </label>
                <input
                  id={`prod-item-${row.id}`}
                  value={row.item}
                  maxLength={120}
                  disabled={locked}
                  placeholder="What needs making"
                  onChange={(e) => update(rows.map((p) => (p.id === row.id ? { ...p, item: e.target.value } : p)))}
                  className="h-11 w-full rounded-xl border border-border-strong bg-bg/60 px-3 text-base text-text focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none disabled:opacity-60"
                />
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true">
                      $
                    </span>
                    <input
                      aria-label={`Cost of ${row.item || `item ${i + 1}`}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={text}
                      disabled={locked}
                      placeholder="Not entered"
                      aria-invalid={bad}
                      onChange={(e) => setAmount(row, e.target.value)}
                      className={
                        "h-11 w-full rounded-xl border bg-bg/60 pr-3 pl-7 text-base text-text tabular-nums focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none disabled:opacity-60 " +
                        (bad ? "border-danger" : "border-border-strong")
                      }
                    />
                  </div>
                  {locked ? null : (
                    <button
                      type="button"
                      onClick={() => update(rows.filter((p) => p.id !== row.id))}
                      aria-label={`Remove ${row.item || `item ${i + 1}`}`}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-strong text-muted transition-colors hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {bad ? <p className="mt-1 text-sm text-danger">Enter an amount in dollars, for example 800.</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-subtle">No production costs added.</p>
      )}
      {!locked && rows.length < MAX_PRODUCTION ? (
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => update([...rows, { id: newId(), item: "", amount_cents: null }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add a cost
        </Button>
      ) : null}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted">Production total</span>
        <span className="font-semibold">
          {money(total)}
          {missing ? <span className="ml-1 font-normal text-subtle">({missing} not entered)</span> : null}
        </span>
      </div>
      <p className="mt-1 text-xs text-subtle">
        Media {money(plan.data.total_cents)} + production {money(total)} = {money(plan.data.total_cents + total)}
      </p>
    </section>
  );
}
