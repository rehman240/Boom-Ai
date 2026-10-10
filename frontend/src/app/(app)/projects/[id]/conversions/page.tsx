"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  History,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { NameVersion } from "@/components/app/AssetEditor";
import { CampaignUnavailable, StageHeader, useCampaign } from "@/components/app/StageHeader";
import { VersionHistory } from "@/components/app/VersionHistory";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SaveState } from "@/components/ui/SaveState";
import { ApiError } from "@/lib/api";
import { approveAsset, unapproveAsset } from "@/lib/assets";
import { inputValue, money, parseMoney } from "@/lib/budget";
import {
  CADENCES,
  MAX_CHECKLIST,
  addEntry,
  changeEntry,
  createPlan,
  deleteEntry,
  formatResult,
  getConversions,
  parseCount,
  shortDate,
  tickStep,
  type Cadence,
  type ConversionStage,
  type Entry,
  type EntryInput,
  type MeasurementData,
  type MeasurementPlan,
} from "@/lib/conversions";
import { editItem, saveVersion } from "@/lib/items";
import { useAutosave } from "@/lib/useAutosave";

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const newId = () => Math.random().toString(16).slice(2, 14);
const SHOWN_DATES = 6;

export default function ConversionsPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCampaign(id);
  const [stage, setStage] = useState<ConversionStage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [history, setHistory] = useState(false);
  const [naming, setNaming] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStage(await getConversions(id));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e, "Couldn't load this step."));
    }
  }, [id]);

  useEffect(() => {
    // Loading data on mount; the state is set once the request comes back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function act(key: string, run: () => Promise<unknown>, fallback: string) {
    setError("");
    setBusy(key);
    try {
      const out = await run();
      // Most routes here answer with the whole stage; the item routes don't.
      if (out && typeof out === "object" && "results" in out) setStage(out as ConversionStage);
      else await refresh();
      return true;
    } catch (e) {
      setError(message(e, fallback));
      return false;
    } finally {
      setBusy("");
    }
  }

  if (load.status === "error") return <CampaignUnavailable message={load.message} />;

  const readOnly = load.status === "ready" && load.project.is_demo;
  const plan = stage?.plan ?? null;
  const approved = !!plan?.approved_at;

  return (
    <>
      <StageHeader
        load={load}
        stage="conversions"
        eyebrow="06 / Manage conversions"
        title="Measure what matters"
        subtitle="Decide what counts as a result, set up tracking before you spend, and enter your numbers as the campaign runs."
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
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : null}

      {stage?.blocked_reason ? (
        <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <h2 className="font-display text-xl font-bold">First, confirm your brief</h2>
          <p className="mt-2 max-w-xl text-muted">
            {stage.blocked_reason} The plan starts from the goal and landing page in your brief.
          </p>
          <ButtonLink href={`/projects/${id}/brief`} className="mt-6">
            Go to the brief <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
        </section>
      ) : null}

      {stage && !stage.blocked_reason ? (
        <>
          {error ? <Alert>{error}</Alert> : null}

          {plan ? (
            <>
              {approved ? (
                <p className="mt-8 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Plan approved. You can still tick checklist steps and enter results. Unapprove it to change the plan.
                </p>
              ) : null}
              <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
                <PlanCard
                  key={`${plan.id}-${plan.version}`}
                  projectId={id}
                  plan={plan}
                  locked={readOnly || approved}
                  hasDates={!!(stage.start_date && stage.end_date)}
                  onSaved={refresh}
                />
                <Checklist
                  projectId={id}
                  plan={plan}
                  readOnly={readOnly}
                  locked={readOnly || approved}
                  onStage={setStage}
                  refresh={refresh}
                />
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button variant="secondary" onClick={() => setHistory(true)} disabled={busy !== ""}>
                  <History className="h-4 w-4" aria-hidden="true" /> Plan versions
                </Button>
                {readOnly || approved ? null : (
                  <Button variant="secondary" onClick={() => setNaming(true)} disabled={busy !== ""}>
                    <Save className="h-4 w-4" aria-hidden="true" /> Save version
                  </Button>
                )}
              </div>
            </>
          ) : (
            <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan">
                <ClipboardList className="h-4 w-4" aria-hidden="true" /> Measurement plan
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">Know what a result is before you spend</h2>
              <p className="mt-2 max-w-2xl text-muted">
                We start a plan from your brief: the action that counts, the page people land on, a checklist to set up
                tracking, and when to look at your numbers. You can change all of it.
              </p>
              {readOnly ? null : (
                <Button
                  className="mt-6"
                  onClick={() => act("create", () => createPlan(id), "Couldn't set up the plan. Please try again.")}
                  loading={busy === "create"}
                >
                  <ClipboardList className="h-4 w-4" aria-hidden="true" /> Set up the plan
                </Button>
              )}
            </section>
          )}

          <Results stage={stage} />
          <Entries projectId={id} stage={stage} readOnly={readOnly} onStage={setStage} />

          {plan && !readOnly ? (
            // Sticky on large screens only, with room on the right for the round audio guide
            // button. On phones it ends the page, with space below so the button never covers it.
            <div className="mt-8 mb-24 rounded-2xl border border-border bg-bg/95 px-4 py-4 lg:sticky lg:bottom-0 lg:z-10 lg:mb-0 lg:pr-24 lg:backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted" role="status">
                    <span className="font-semibold text-text">{approved ? "Plan approved." : "Plan not approved yet."}</span>{" "}
                    {plan.data.checklist.filter((c) => c.done).length} of {plan.data.checklist.length} tracking steps done.
                  </p>
                  <p className="mt-1 text-sm text-subtle">
                    {approved ? "Unapprove it to change the plan." : "Changes save as you go. Approve the plan when it looks right."}
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
                      <Check className="h-4 w-4" aria-hidden="true" /> Approve plan
                    </Button>
                  )}
                  <ButtonLink href={`/projects/${id}/review`}>
                    Continue to review <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </ButtonLink>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {history && plan ? (
        <VersionHistory
          projectId={id}
          item={plan}
          title="Measurement plan"
          preview={(d) => [String(d.goal ?? ""), String(d.landing_url ?? "")].filter(Boolean).join(" · ")}
          readOnly={readOnly || approved}
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
    </>
  );
}

/** Goal, landing page and review cadence. Saves as you type. */
function PlanCard({
  projectId,
  plan,
  locked,
  hasDates,
  onSaved,
}: {
  projectId: string;
  plan: MeasurementPlan;
  locked: boolean;
  hasDates: boolean;
  onSaved: () => void;
}) {
  const [data, setData] = useState<MeasurementData>(plan.data);
  const autosave = useAutosave<MeasurementData>(async (changes) => {
    await editItem(projectId, plan.id, changes);
    // The review dates depend on the cadence, which only the server works out.
    if ("review_cadence" in changes) onSaved();
  });

  function change<K extends keyof MeasurementData>(key: K, value: MeasurementData[K]) {
    setData((d) => ({ ...d, [key]: value }));
    autosave.queue({ [key]: value } as Partial<MeasurementData>);
  }

  const dates = plan.review_dates;

  return (
    <section aria-labelledby="plan-title" className="min-w-0 rounded-3xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="plan-title" className="font-display text-2xl font-bold">
          Your measurement plan
        </h2>
        <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} />
      </div>
      <div className="mt-6 space-y-6">
        <Field
          label="What counts as a result"
          hint="The one action you want people to take, for example a preorder or a sign up."
          maxLength={100}
          value={data.goal}
          disabled={locked}
          onChange={(e) => change("goal", e.target.value)}
        />
        <Field
          label="Landing page"
          hint="Where the ads send people. Leave it empty if the page isn't ready yet."
          type="url"
          inputMode="url"
          maxLength={500}
          placeholder="https://"
          value={data.landing_url}
          disabled={locked}
          onChange={(e) => change("landing_url", e.target.value)}
        />
        <div>
          <label htmlFor="cadence" className="mb-2 block text-lg font-semibold">
            How often to check the numbers
          </label>
          <select
            id="cadence"
            value={data.review_cadence}
            disabled={locked}
            onChange={(e) => change("review_cadence", e.target.value as Cadence)}
            className="h-16 w-full rounded-xl border border-border-strong bg-bg/60 px-4 text-lg text-text focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none disabled:opacity-60"
          >
            {CADENCES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="mt-3 rounded-2xl border border-border-strong p-4">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-subtle">
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> Review dates
            </p>
            {hasDates && dates.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {dates.slice(0, SHOWN_DATES).map((d, i) => (
                  <li key={d} className="rounded-full border border-border-strong px-3 py-1 text-sm">
                    {shortDate(d)}
                    {i === dates.length - 1 ? " (last day)" : ""}
                  </li>
                ))}
                {dates.length > SHOWN_DATES ? (
                  <li className="px-1 py-1 text-sm text-muted">
                    and {dates.length - SHOWN_DATES} more, ending {shortDate(dates[dates.length - 1])}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Add start and end dates to the brief to see the review dates.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Tracking steps. Ticking is progress, so it works even when the plan is approved. */
function Checklist({
  projectId,
  plan,
  readOnly,
  locked,
  onStage,
  refresh,
}: {
  projectId: string;
  plan: MeasurementPlan;
  readOnly: boolean;
  locked: boolean;
  onStage: (s: ConversionStage) => void;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [text, setText] = useState("");
  // A tick shows at once; the server's answer replaces it, or a failure takes it back.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const steps = plan.data.checklist.map((s) => (s.id in ticked ? { ...s, done: ticked[s.id] } : s));
  const done = steps.filter((s) => s.done).length;

  async function tick(stepId: string, value: boolean) {
    setTicked((t) => ({ ...t, [stepId]: value }));
    await run(stepId, () => tickStep(projectId, stepId, value));
    setTicked((t) => {
      const next = { ...t };
      delete next[stepId];
      return next;
    });
  }

  async function run(key: string, call: () => Promise<unknown>) {
    setError("");
    setBusy(key);
    try {
      const out = await call();
      if (out && typeof out === "object" && "results" in out) onStage(out as ConversionStage);
      else await refresh();
    } catch (e) {
      setError(message(e, "Couldn't save. Please try again."));
    } finally {
      setBusy("");
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    run("add", async () => {
      await editItem(projectId, plan.id, { checklist: [...plan.data.checklist, { id: newId(), text: clean, done: false }] });
      setText("");
    });
  }

  return (
    <section aria-labelledby="checklist-title" className="min-w-0 rounded-3xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="checklist-title" className="font-display text-2xl font-bold">
            Tracking checklist
          </h2>
          <p className="mt-1 text-muted">Set these up before the campaign starts.</p>
        </div>
        <span className="rounded-full border border-cyan/40 bg-primary/15 px-3 py-1 text-sm font-semibold text-cyan" role="status">
          {done} of {steps.length} done
        </span>
      </div>
      {error ? (
        <p className="mt-4 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}
      <ul className="mt-5 space-y-3">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3 rounded-2xl border border-border-strong p-3">
            <input
              id={`step-${step.id}`}
              type="checkbox"
              checked={step.done}
              disabled={readOnly || (busy !== "" && busy !== step.id)}
              onChange={(e) => tick(step.id, e.target.checked)}
              className="mt-1 h-6 w-6 shrink-0 accent-[var(--primary)]"
            />
            <label htmlFor={`step-${step.id}`} className={`min-w-0 flex-1 ${step.done ? "text-muted line-through" : ""}`}>
              {step.text}
            </label>
            {locked ? null : (
              <button
                type="button"
                onClick={() => run(`remove-${step.id}`, () => editItem(projectId, plan.id, { checklist: plan.data.checklist.filter((s) => s.id !== step.id) }))}
                disabled={busy !== ""}
                aria-label={`Remove step: ${step.text}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-strong text-muted transition-colors hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!locked && steps.length < MAX_CHECKLIST ? (
        <form onSubmit={add} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="new-step" className="sr-only">
            Add your own step
          </label>
          <input
            id="new-step"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add your own step"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border-strong bg-bg/60 px-4 text-lg text-text focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none"
          />
          <Button type="submit" variant="secondary" loading={busy === "add"} disabled={!text.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add step
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/** The calculations, each with what it means, or what is needed to work it out. */
function Results({ stage }: { stage: ConversionStage }) {
  return (
    <section aria-labelledby="results-title" className="mt-10">
      <h2 id="results-title" className="font-display text-2xl font-bold">
        Your results
      </h2>
      <p className="mt-1 max-w-2xl text-muted">
        Worked out only from the numbers you enter below. Nothing is connected to your ad accounts, and nothing is changed
        for you.
      </p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stage.results.map((r) => (
          <li key={r.key} className="flex flex-col rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-subtle">{r.label}</p>
            {r.value !== null ? (
              <p className="mt-2 font-display text-3xl font-bold">{formatResult(r, money)}</p>
            ) : (
              <p className="mt-2 text-base text-muted">{r.missing}</p>
            )}
            <p className="mt-auto pt-3 text-sm text-subtle">{r.definition}</p>
            {r.note ? <p className="mt-1 text-sm text-warning">{r.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const EMPTY: EntryInput = { period: "", spend_cents: null, leads: null, sales: null, revenue_cents: null, note: null };

/** The results the user entered, with a form to add or change one. */
function Entries({
  projectId,
  stage,
  readOnly,
  onStage,
}: {
  projectId: string;
  stage: ConversionStage;
  readOnly: boolean;
  onStage: (s: ConversionStage) => void;
}) {
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { entries, totals } = stage;

  async function save(entry: EntryInput) {
    setError("");
    setBusy(true);
    try {
      onStage(
        editing && editing !== "new" ? await changeEntry(projectId, editing.id, entry) : await addEntry(projectId, entry),
      );
      setEditing(null);
    } catch (e) {
      setError(message(e, "Couldn't save the results. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    setError("");
    setBusy(true);
    try {
      onStage(await deleteEntry(projectId, entry.id));
      setRemoving(null);
    } catch (e) {
      setError(message(e, "Couldn't delete. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const count = (n: number | null) => (n === null ? "–" : n.toLocaleString("en-US"));
  const cash = (c: number | null) => (c === null ? "–" : money(c));

  return (
    <section aria-labelledby="entries-title" className="mt-10 rounded-3xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="entries-title" className="font-display text-2xl font-bold">
            Enter your numbers
          </h2>
          <p className="mt-1 text-muted">
            Copy them from your ad accounts and shop, one line per period. Leave a box empty if you don&apos;t know it yet.
          </p>
        </div>
        {readOnly || editing ? null : (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add results
          </Button>
        )}
      </div>

      {error ? (
        <p className="mt-4 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}

      {editing ? (
        <EntryForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? { ...EMPTY, period: `Week ${entries.length + 1}` } : editing}
          saving={busy}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setError("");
          }}
        />
      ) : null}

      {entries.length ? (
        <div className="relative mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">Results you entered</caption>
            <thead>
              <tr className="border-b border-border text-sm uppercase tracking-[0.1em] text-subtle">
                <th scope="col" className="py-2 pr-3 font-semibold">Period</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Spend</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Leads</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Sales</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Revenue</th>
                <th scope="col" className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border align-top">
                  <th scope="row" className="py-3 pr-3 font-semibold">
                    {e.period}
                    {e.note ? <span className="block text-sm font-normal text-muted">{e.note}</span> : null}
                  </th>
                  <td className="py-3 pr-3 text-right tabular-nums">{cash(e.spend_cents)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{count(e.leads)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{count(e.sales)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{cash(e.revenue_cents)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {readOnly ? null : (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing(e)}
                          aria-label={`Change ${e.period}`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoving(e)}
                          aria-label={`Delete ${e.period}`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <th scope="row" className="py-3 pr-3">Total</th>
                <td className="py-3 pr-3 text-right tabular-nums">{cash(totals.spend_cents)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{count(totals.leads)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{count(totals.sales)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{cash(totals.revenue_cents)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : editing ? null : (
        <p className="mt-6 rounded-2xl border border-dashed border-border-strong p-5 text-muted">
          No results yet. Once the campaign is running, add your spend, leads, sales and revenue here.
        </p>
      )}
      {stage.media_budget_cents > 0 ? (
        <p className="mt-3 text-sm text-subtle">Media budget in your brief: {money(stage.media_budget_cents)}.</p>
      ) : null}

      {removing ? (
        <Dialog
          title={`Delete ${removing.period}?`}
          description="These numbers are removed and the results are worked out again without them."
          onClose={() => setRemoving(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => remove(removing)} loading={busy}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
            </Button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

type FormText = { period: string; spend: string; leads: string; sales: string; revenue: string; note: string };

function EntryForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: EntryInput;
  saving: boolean;
  onSave: (entry: EntryInput) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState<FormText>({
    period: initial.period,
    spend: inputValue(initial.spend_cents),
    leads: initial.leads === null ? "" : String(initial.leads),
    sales: initial.sales === null ? "" : String(initial.sales),
    revenue: inputValue(initial.revenue_cents),
    note: initial.note ?? "",
  });
  const [tried, setTried] = useState(false);

  const dollars = (s: string) => (s.trim() === "" ? null : parseMoney(s) ?? undefined);
  const parsed = {
    spend_cents: dollars(text.spend),
    leads: parseCount(text.leads),
    sales: parseCount(text.sales),
    revenue_cents: dollars(text.revenue),
  };
  const errors = {
    period: text.period.trim() ? "" : "Name the period, for example Week 1.",
    spend: parsed.spend_cents === undefined ? "Enter dollars, for example 1500." : "",
    leads: parsed.leads === undefined ? "Enter a whole number." : "",
    sales: parsed.sales === undefined ? "Enter a whole number." : "",
    revenue: parsed.revenue_cents === undefined ? "Enter dollars, for example 4200." : "",
  };
  const noFigure = Object.values(parsed).every((v) => v === null);
  const valid = Object.values(errors).every((e) => !e) && !noFigure;

  function set(key: keyof FormText, value: string) {
    setText((t) => ({ ...t, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    onSave({
      period: text.period.trim(),
      spend_cents: parsed.spend_cents ?? null,
      leads: parsed.leads ?? null,
      sales: parsed.sales ?? null,
      revenue_cents: parsed.revenue_cents ?? null,
      note: text.note.trim() || null,
    });
  }

  const show = (key: keyof typeof errors) => (tried ? errors[key] || undefined : undefined);

  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-2xl border border-border-strong p-4 sm:p-5">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Period" required maxLength={60} value={text.period} onChange={(e) => set("period", e.target.value)} error={show("period")} />
        <Field label="Spend ($)" inputMode="decimal" autoComplete="off" value={text.spend} onChange={(e) => set("spend", e.target.value)} error={show("spend")} />
        <Field label="Leads" inputMode="numeric" autoComplete="off" value={text.leads} onChange={(e) => set("leads", e.target.value)} error={show("leads")} />
        <Field label="Sales" inputMode="numeric" autoComplete="off" value={text.sales} onChange={(e) => set("sales", e.target.value)} error={show("sales")} />
        <Field label="Revenue ($)" inputMode="decimal" autoComplete="off" value={text.revenue} onChange={(e) => set("revenue", e.target.value)} error={show("revenue")} />
        <Field label="Note" hint="Optional" maxLength={300} value={text.note} onChange={(e) => set("note", e.target.value)} />
      </div>
      {tried && noFigure ? (
        <p className="mt-4 text-base text-danger" role="alert">
          Enter at least one figure: spend, leads, sales or revenue.
        </p>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          <Check className="h-4 w-4" aria-hidden="true" /> Save results
        </Button>
      </div>
    </form>
  );
}
