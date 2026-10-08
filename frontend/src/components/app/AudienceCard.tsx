"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Check, History, Lightbulb, Pencil, Trash2, Undo2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SaveState } from "@/components/ui/SaveState";
import { ChipGroup, Textarea } from "@/components/ui/Inputs";
import { MAX_CHANNELS, type AudienceCard as Card, type AudienceDraft } from "@/lib/audiences";
import { CHANNELS, SOURCE_LABELS } from "@/lib/brief";
import { FLAG_LABELS } from "@/lib/items";
import { useCardEditor } from "@/lib/useCardEditor";

// Header bands, after the direction cards in the reference screens. White text on each passes AA.
const BANDS = ["bg-[#1a56b0]", "bg-[#146a80]", "bg-[#55449a]", "bg-[#7a3e78]"];

export const letter = (index: number) => String.fromCharCode(65 + (index % 26));

export function draftOf(card: Card): AudienceDraft {
  const { name, definition, need, motivation, objection, message_angle, channels } = card.data;
  return { name, definition, need, motivation, objection, message_angle, channels };
}

/** The fields of an audience, for editing a card and for writing your own. */
export function AudienceForm({
  value,
  onChange,
  errors = {},
}: {
  value: AudienceDraft;
  onChange: (next: AudienceDraft) => void;
  errors?: Partial<Record<keyof AudienceDraft, string>>;
}) {
  const set = <K extends keyof AudienceDraft>(key: K, v: AudienceDraft[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-5">
      <Field
        label="Audience name"
        required
        maxLength={80}
        value={value.name}
        onChange={(e) => set("name", e.target.value)}
        error={errors.name}
        hint="A short name, e.g. “Hybrid workers”."
      />
      <Textarea
        label="Who they are"
        required
        maxLength={400}
        rows={2}
        value={value.definition}
        onChange={(e) => set("definition", e.target.value)}
        error={errors.definition}
        hint="Describe their situation and behaviour, not age, health, religion or similar traits."
      />
      <Textarea label="What they need" maxLength={400} rows={2} value={value.need} onChange={(e) => set("need", e.target.value)} />
      <Textarea label="Why they would act" maxLength={400} rows={2} value={value.motivation} onChange={(e) => set("motivation", e.target.value)} />
      <Textarea label="What holds them back" maxLength={400} rows={2} value={value.objection} onChange={(e) => set("objection", e.target.value)} />
      <Textarea label="Message angle" maxLength={400} rows={2} value={value.message_angle} onChange={(e) => set("message_angle", e.target.value)} />
      <ChipGroup
        label="Where to reach them"
        options={CHANNELS}
        value={value.channels}
        onChange={(next) => set("channels", next.slice(0, MAX_CHANNELS))}
        hint={`Up to ${MAX_CHANNELS}.`}
      />
    </div>
  );
}

export function validateAudience(d: AudienceDraft) {
  const errors: Partial<Record<keyof AudienceDraft, string>> = {};
  if (!d.name.trim()) errors.name = "Give this audience a name.";
  if (!d.definition.trim()) errors.definition = "Say who they are.";
  return errors;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-subtle">{label}</dt>
      <dd className="mt-1 text-base leading-relaxed text-text">{children}</dd>
    </div>
  );
}

/** One audience: read it, edit it, choose it, look back through its versions. */
export function AudienceCardView({
  card,
  index,
  readOnly,
  busy,
  onChoose,
  onSave,
  onUndo,
  onHistory,
  onRemove,
}: {
  card: Card;
  index: number;
  readOnly: boolean;
  busy: boolean;
  onChoose: () => void;
  onSave: (changes: Partial<AudienceDraft>) => Promise<unknown>;
  onUndo: () => void;
  onHistory: () => void;
  onRemove: () => void;
}) {
  const editor = useCardEditor<AudienceDraft>({ draft: () => draftOf(card), validate: validateAudience, save: onSave });
  const editing = editor.editing;
  const formRef = useRef<HTMLDivElement>(null);
  const isEditing = editing !== null;
  const d = card.data;

  // Opening the editor moves focus to its first field, so keyboard and phone users start there.
  useEffect(() => {
    if (!isEditing) return;
    const first = formRef.current?.querySelector<HTMLElement>("input, textarea");
    first?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isEditing]);
  const own = card.origin === "user";
  const titleId = `audience-${card.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className={
        "flex flex-col overflow-hidden rounded-3xl border bg-surface transition-colors " +
        (card.selected ? "border-cyan ring-2 ring-cyan/40" : "border-border")
      }
    >
      <div className={`flex items-center justify-between gap-3 px-5 py-4 ${BANDS[index % BANDS.length]}`}>
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-white">
          {own ? <User className="h-4 w-4" aria-hidden="true" /> : <Users className="h-4 w-4" aria-hidden="true" />}
          Audience {letter(index)}
        </p>
        <span className="rounded-full bg-black/25 px-3 py-1 text-sm font-semibold text-white">
          {own ? "Written by you" : "Hypothesis"}
        </span>
      </div>

      {editing ? (
        <div ref={formRef} className="flex flex-1 scroll-mt-24 flex-col p-5 sm:p-6">
          <h3 id={titleId} className="mb-5 font-display text-xl font-bold">
            Edit audience {letter(index)}
          </h3>
          <AudienceForm value={editing} onChange={editor.change} errors={editor.errors} />
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button onClick={editor.done}>
              <Check className="h-4 w-4" aria-hidden="true" /> Done
            </Button>
            <SaveState status={editor.status} error={editor.error} retry={editor.retry} />
          </div>
          <p className="mt-3 text-sm text-subtle">Changes save as you type.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          {card.selected ? (
            <p className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-sm font-semibold text-success">
              <Check className="h-4 w-4" aria-hidden="true" /> Primary audience
            </p>
          ) : null}
          <h3 id={titleId} className="font-display text-xl font-bold leading-snug">
            {d.name}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-muted">{d.definition}</p>

          <dl className="mt-5 space-y-4">
            <Detail label="Need">{d.need}</Detail>
            <Detail label="Why they would act">{d.motivation}</Detail>
            <Detail label="What holds them back">{d.objection}</Detail>
            <Detail label="Message angle">{d.message_angle ? <span className="text-cyan">{d.message_angle}</span> : null}</Detail>
          </dl>

          {d.channels.length ? (
            <div className="mt-5">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-subtle">Where to reach them</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {d.channels.map((c) => (
                  <li key={c} className="rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-sm font-medium text-text">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {d.based_on.length ? (
            <div className="mt-5 rounded-2xl border border-border bg-surface-2 p-4">
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
            <div className="mt-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-text">
                <Lightbulb className="h-4 w-4 text-warning" aria-hidden="true" /> Assumptions to check
              </p>
              <p className="text-sm text-subtle">Inferred by the AI, not stated in your brief.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {d.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {card.review_flags.length ? (
            <ul className="mt-4 space-y-2">
              {card.review_flags.map((f, i) => (
                <li key={i} className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold uppercase tracking-wide text-warning">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {FLAG_LABELS[f.category] ?? f.category}: “{f.claim}”
                  </p>
                  <p className="mt-1 text-muted">{f.reason}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-auto pt-6">
            {card.unsaved_changes && card.version > 0 && !readOnly ? (
              <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                Edited by you.
                <button type="button" onClick={onUndo} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-cyan underline-offset-4 hover:underline disabled:opacity-50">
                  <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo edits
                </button>
              </p>
            ) : null}
            {readOnly ? null : (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {card.selected ? null : (
                  <Button onClick={onChoose} disabled={busy} className="grow sm:grow-0">
                    Choose as primary
                  </Button>
                )}
                <Button variant="secondary" onClick={editor.open} disabled={busy}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                </Button>
                <Button variant="ghost" onClick={onHistory} disabled={busy} aria-label={`History of audience ${letter(index)}`}>
                  <History className="h-4 w-4" aria-hidden="true" /> History
                </Button>
                <Button variant="ghost" onClick={onRemove} disabled={busy} aria-label={`Remove audience ${letter(index)}`} className="text-danger hover:text-danger">
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
