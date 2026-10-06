"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Clock, History, Lightbulb, Loader2, Pencil, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ChipGroup, Textarea } from "@/components/ui/Inputs";
import { CHANNELS, SOURCE_LABELS } from "@/lib/brief";
import { MAX_RISKS, slotLetter, type Direction, type DirectionDraft } from "@/lib/directions";
import { FLAG_LABELS } from "@/lib/items";

// Header bands as in the reference screen: blue, teal, violet. White text on each passes AA.
const BANDS: Record<string, string> = { "1": "bg-[#1a56b0]", "2": "bg-[#146a80]", "3": "bg-[#55449a]" };

export function directionDraft(d: Direction): DirectionDraft {
  const { name, promise, headline, key_message, concept, channels, channel_fit, risks, rationale } = d.data;
  return { name, promise, headline, key_message, concept, channels, channel_fit, risks, rationale };
}

function Rings() {
  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 text-white/45" aria-hidden="true">
      {[46, 32, 18].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="2" />
      ))}
    </svg>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold uppercase tracking-[0.12em] text-subtle">{children}</p>;
}

function DirectionForm({
  value,
  onChange,
  errors,
}: {
  value: DirectionDraft;
  onChange: (next: DirectionDraft) => void;
  errors: Partial<Record<keyof DirectionDraft, string>>;
}) {
  const set = <K extends keyof DirectionDraft>(key: K, v: DirectionDraft[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-5">
      <Field label="Name" required maxLength={60} value={value.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
      <Textarea label="Central promise" required maxLength={200} rows={2} value={value.promise} onChange={(e) => set("promise", e.target.value)} error={errors.promise} />
      <Field label="Example headline" maxLength={120} value={value.headline} onChange={(e) => set("headline", e.target.value)} hint="Only claim what your brief says." />
      <Textarea label="Key message" maxLength={400} rows={2} value={value.key_message} onChange={(e) => set("key_message", e.target.value)} />
      <Textarea label="Creative concept" maxLength={600} rows={3} value={value.concept} onChange={(e) => set("concept", e.target.value)} />
      <ChipGroup label="Channels" options={CHANNELS} value={value.channels} onChange={(next) => set("channels", next.slice(0, 5))} hint="Up to 5." />
      <Textarea label="Why these channels" maxLength={300} rows={2} value={value.channel_fit} onChange={(e) => set("channel_fit", e.target.value)} />
      <Textarea
        label="Risks"
        rows={3}
        value={value.risks.join("\n")}
        onChange={(e) => set("risks", e.target.value.split("\n"))}
        error={errors.risks}
        hint={`One per line, up to ${MAX_RISKS}.`}
      />
      <Textarea label="Why it could work" maxLength={500} rows={3} value={value.rationale} onChange={(e) => set("rationale", e.target.value)} />
    </div>
  );
}

function validate(d: DirectionDraft) {
  const errors: Partial<Record<keyof DirectionDraft, string>> = {};
  if (!d.name.trim()) errors.name = "Give this direction a name.";
  if (!d.promise.trim()) errors.promise = "Say what it promises.";
  const risks = d.risks.map((r) => r.trim()).filter(Boolean);
  if (risks.length > MAX_RISKS) errors.risks = `Keep it to ${MAX_RISKS} risks.`;
  if (risks.some((r) => r.length > 400)) errors.risks = "Each risk can be up to 400 characters.";
  return errors;
}

/** One campaign direction: compare it, choose it, edit it, or ask for a new one in its place. */
export function DirectionCard({
  direction,
  details,
  readOnly,
  busy,
  rewriting,
  slotError,
  onChoose,
  onSave,
  onUndo,
  onRegenerate,
  onHistory,
}: {
  direction: Direction;
  details: boolean;
  readOnly: boolean;
  busy: boolean;
  rewriting: boolean;
  slotError: string;
  onChoose: () => void;
  onSave: (changes: Partial<DirectionDraft>) => Promise<boolean>;
  onUndo: () => void;
  onRegenerate: () => void;
  onHistory: () => void;
}) {
  const [editing, setEditing] = useState<DirectionDraft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof DirectionDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const isEditing = editing !== null;
  const d = direction.data;
  const letter = slotLetter(direction.slot);
  const titleId = `direction-${direction.slot}`;
  const approved = direction.approved_at !== null;

  useEffect(() => {
    if (!isEditing) return;
    formRef.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isEditing]);

  async function save() {
    if (!editing) return;
    const cleaned = { ...editing, risks: editing.risks.map((r) => r.trim()).filter(Boolean) };
    const found = validate(cleaned);
    setErrors(found);
    if (Object.keys(found).length) return;
    const before = directionDraft(direction);
    const changes = Object.fromEntries(
      Object.entries(cleaned).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k as keyof DirectionDraft])),
    ) as Partial<DirectionDraft>;
    if (!Object.keys(changes).length) {
      setEditing(null);
      return;
    }
    setSaving(true);
    const ok = await onSave(changes);
    setSaving(false);
    if (ok) setEditing(null);
  }

  return (
    <article
      aria-labelledby={titleId}
      aria-busy={rewriting}
      className={
        "relative flex flex-col overflow-hidden rounded-3xl border bg-surface transition-colors " +
        (direction.selected ? "border-cyan ring-2 ring-cyan/40" : "border-border")
      }
    >
      <div className={`flex h-28 items-end justify-between px-5 pb-4 ${BANDS[direction.slot] ?? BANDS["1"]}`}>
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-white">Direction {letter}</p>
        <Rings />
      </div>

      {rewriting ? (
        <div className="flex flex-1 flex-col items-center gap-3 px-8 pt-12 pb-8 text-center" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-cyan" aria-hidden="true" />
          <p className="font-display text-lg font-bold">Writing a new direction {letter}…</p>
          <p className="text-sm text-muted">Usually under a minute. The other directions stay as they are.</p>
        </div>
      ) : editing ? (
        <div ref={formRef} className="flex flex-1 scroll-mt-24 flex-col p-5 sm:p-6">
          <h3 id={titleId} className="mb-5 font-display text-xl font-bold">
            Edit direction {letter}
          </h3>
          <DirectionForm value={editing} onChange={setEditing} errors={errors} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={save} loading={saving}>
              <Check className="h-4 w-4" aria-hidden="true" /> Save changes
            </Button>
            <Button variant="secondary" onClick={() => (setEditing(null), setErrors({}))} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap gap-2">
            {direction.selected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-sm font-semibold text-success">
                <Check className="h-4 w-4" aria-hidden="true" /> Chosen direction
              </span>
            ) : null}
            {approved ? (
              <span className="rounded-full border border-success/40 px-3 py-1 text-sm font-semibold text-success">Approved</span>
            ) : null}
            {direction.outdated ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-sm font-semibold text-warning">
                <Clock className="h-4 w-4" aria-hidden="true" /> Made for an earlier audience or brief
              </span>
            ) : null}
          </div>

          <h3 id={titleId} className="font-display text-xl font-bold leading-snug">
            {d.name}
          </h3>
          <p className="mt-3 text-lg font-semibold leading-snug text-cyan">{d.promise}</p>
          <p className="mt-3 text-base leading-relaxed text-muted">{d.concept}</p>

          {d.headline ? (
            <div className="mt-5 border-t border-border pt-4">
              <Label>Example headline</Label>
              <p className="mt-1 text-base text-text">“{d.headline}”</p>
            </div>
          ) : null}

          {d.channels.length ? (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Channels">
              {d.channels.map((c) => (
                <li key={c} className="rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-sm font-medium text-text">
                  {c}
                </li>
              ))}
            </ul>
          ) : null}

          {details ? (
            <div className="mt-5 space-y-4 border-t border-border pt-4">
              {d.key_message ? (
                <div>
                  <Label>Key message</Label>
                  <p className="mt-1 text-base text-text">{d.key_message}</p>
                </div>
              ) : null}
              {d.channel_fit ? (
                <div>
                  <Label>Why these channels</Label>
                  <p className="mt-1 text-base text-muted">{d.channel_fit}</p>
                </div>
              ) : null}
              {d.rationale ? (
                <div>
                  <Label>Why it could work</Label>
                  <p className="mt-1 text-base text-muted">{d.rationale}</p>
                </div>
              ) : null}
              {d.risks.length ? (
                <div>
                  <Label>Risks</Label>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-muted">
                    {d.risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {d.based_on.length ? (
                <div className="rounded-2xl border border-border bg-surface-2 p-4">
                  <p className="text-sm font-semibold text-text">Based on your brief</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {d.based_on.map((b, i) => (
                      <li key={i}>
                        <span className="font-semibold text-cyan">{SOURCE_LABELS[b.source] ?? b.source}:</span>{" "}
                        <span className="text-muted">{b.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {d.assumptions.length ? (
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-text">
                    <Lightbulb className="h-4 w-4 text-warning" aria-hidden="true" /> Assumptions to check
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                    {d.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : d.risks.length ? (
            <p className="mt-4 text-sm text-subtle">
              {d.risks.length} {d.risks.length === 1 ? "risk" : "risks"} noted. Show full details to read them.
            </p>
          ) : null}

          {direction.review_flags.length ? (
            <ul className="mt-4 space-y-2">
              {direction.review_flags.map((f, i) => (
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

          {slotError ? (
            <p className="mt-4 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{slotError} This direction is unchanged.</span>
            </p>
          ) : null}

          <div className="mt-auto pt-6">
            {direction.unsaved_changes && !readOnly ? (
              <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                Edited by you.
                <button type="button" onClick={onUndo} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-cyan underline-offset-4 hover:underline disabled:opacity-50">
                  <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo edits
                </button>
              </p>
            ) : null}
            {readOnly ? null : (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {direction.selected ? null : (
                  <Button onClick={onChoose} disabled={busy} className="grow">
                    Choose direction
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setEditing(directionDraft(direction))} disabled={busy} className="grow">
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                </Button>
                {approved ? null : (
                  <Button variant="ghost" onClick={onRegenerate} disabled={busy} aria-label={`New idea for direction ${letter}`}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> New idea
                  </Button>
                )}
                <Button variant="ghost" onClick={onHistory} disabled={busy} aria-label={`History of direction ${letter}`}>
                  <History className="h-4 w-4" aria-hidden="true" /> History
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
