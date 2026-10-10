"use client";

import { useId, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  History,
  ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  Save,
} from "lucide-react";
import { VersionHistory } from "@/components/app/VersionHistory";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { SaveState } from "@/components/ui/SaveState";
import { ApiError } from "@/lib/api";
import { isActive, type Job } from "@/lib/brief";
import {
  approveAsset,
  assetText,
  fieldKey,
  regenerateField,
  unapproveAsset,
  type Asset,
  type AssetSpec,
  type FieldSpec,
} from "@/lib/assets";
import { FLAG_LABELS, editItem, saveVersion, type Item } from "@/lib/items";
import { useAutosave } from "@/lib/useAutosave";

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function useCopy() {
  const [copied, setCopied] = useState("");
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? "" : k)), 2000);
    } catch {
      setCopied("");
    }
  }
  return { copied, copy };
}

/**
 * One asset's editor. Typing is autosaved; a field being rewritten by the AI is locked
 * until it returns; an approved asset is read-only until it is unapproved.
 */
export function AssetEditor({
  projectId,
  spec,
  asset,
  businessName,
  readOnly,
  fieldJobs,
  onItem,
  refresh,
}: {
  projectId: string;
  spec: AssetSpec;
  asset: Asset;
  businessName: string;
  readOnly: boolean;
  fieldJobs: Partial<Record<string, Job>>;
  onItem: (item: Item) => void;
  refresh: () => Promise<void>;
}) {
  // Fields typed here but not yet confirmed by the server. Everything else shows the server's text,
  // so an AI rewrite or a restore appears as soon as it lands.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState(false);
  const [naming, setNaming] = useState(false);
  const { copied, copy } = useCopy();

  const autosave = useAutosave<Record<string, string>>(async (changes) => {
    const item = await editItem<Record<string, string>>(projectId, asset.id, changes);
    onItem(item as Item);
    setEdits((current) => {
      const next = { ...current };
      for (const [k, v] of Object.entries(changes)) if (next[k] === v) delete next[k];
      return next;
    });
  });

  const approved = asset.approved_at !== null;
  const locked = readOnly || approved;
  const value = (f: FieldSpec) => edits[f.key] ?? asset.data[f.key] ?? "";
  const data = Object.fromEntries(spec.fields.map((f) => [f.key, value(f)]));

  function change(field: string, text: string) {
    setEdits((e) => ({ ...e, [field]: text }));
    autosave.queue({ [field]: text });
  }

  /** Every action that the server must see the latest text for saves pending edits first. */
  async function act(key: string, run: () => Promise<unknown>, fallback: string) {
    setError("");
    setBusy(key);
    try {
      if (!(await autosave.saveNow())) {
        setError("Your latest changes aren't saved yet. Retry the save, then try again.");
        return;
      }
      await run();
      await refresh();
    } catch (e) {
      setError(message(e, fallback));
    } finally {
      setBusy("");
    }
  }

  async function rewrite(field: FieldSpec) {
    setFieldErrors((errs) => ({ ...errs, [field.key]: "" }));
    await act(`field-${field.key}`, () => regenerateField(projectId, asset.id, field.key), "Couldn't start the rewrite.");
  }

  async function openHistory() {
    if (await autosave.saveNow()) setHistory(true);
    else setError("Your latest changes aren't saved yet. Retry the save, then open the history.");
  }

  const jobFor = (f: FieldSpec) => fieldJobs[fieldKey(asset.id, f.key)];
  const fieldError = (f: FieldSpec) => {
    const job = jobFor(f);
    if (fieldErrors[f.key]) return fieldErrors[f.key];
    // A failed rewrite matters until something newer happened to the asset.
    return job?.status === "failed" && job.created_at > asset.updated_at ? `${job.error} This field is unchanged.` : "";
  };

  return (
    <section aria-labelledby="asset-title" className="min-w-0 rounded-3xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="asset-title" tabIndex={-1} className="font-display text-2xl font-bold outline-none">
            {spec.label}
          </h2>
          <p className="mt-1 text-base text-muted">{spec.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} />
          <span className="rounded-full border border-success/40 bg-success/10 px-3 py-1 text-sm font-semibold text-success">
            Version {asset.version}
            {asset.unsaved_changes ? " · edited" : ""}
          </span>
        </div>
      </div>

      {approved ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Approved. It is locked so nothing changes it by accident. Unapprove it to edit.
        </p>
      ) : null}
      {asset.outdated ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Written for an earlier version of your direction. Rewrite the fields that no longer fit, or write the assets again.
        </p>
      ) : null}
      {asset.review_flags.length ? (
        <ul className="mt-5 space-y-2">
          {asset.review_flags.map((f, i) => (
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
      {error ? (
        <p className="mt-5 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}

      <div className="mt-6 space-y-7">
        {spec.fields.map((f) => (
          <AssetField
            key={f.key}
            field={f}
            value={value(f)}
            locked={locked}
            rewriting={isActive(jobFor(f)) || busy === `field-${f.key}`}
            disabled={busy !== ""}
            error={fieldError(f)}
            copied={copied === f.key}
            onChange={(text) => change(f.key, text)}
            onRewrite={() => rewrite(f)}
            onCopy={() => copy(f.key, value(f))}
          />
        ))}
      </div>

      <Preview assetKey={spec.key} data={data} businessName={businessName} />

      <div className="mt-8 flex flex-wrap gap-3 border-t border-border pt-6">
        <Button variant="secondary" onClick={() => copy("asset", assetText(spec, data))}>
          {copied === "asset" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied === "asset" ? "Copied" : "Copy asset"}
        </Button>
        <Button variant="secondary" onClick={openHistory} disabled={busy !== ""}>
          <History className="h-4 w-4" aria-hidden="true" /> Versions
        </Button>
        {readOnly ? null : (
          <>
            {approved ? null : (
              <Button variant="secondary" onClick={() => setNaming(true)} disabled={busy !== ""}>
                <Save className="h-4 w-4" aria-hidden="true" /> Save version
              </Button>
            )}
            {approved ? (
              <Button
                variant="secondary"
                className="sm:ml-auto"
                onClick={() => act("approve", () => unapproveAsset(projectId, asset.id), "Couldn't unapprove.")}
                loading={busy === "approve"}
              >
                Unapprove to edit
              </Button>
            ) : (
              <Button
                className="sm:ml-auto"
                onClick={() => act("approve", () => approveAsset(projectId, asset.id), "Couldn't approve.")}
                loading={busy === "approve"}
                disabled={busy !== "" && busy !== "approve"}
              >
                <Check className="h-4 w-4" aria-hidden="true" /> Approve asset
              </Button>
            )}
          </>
        )}
      </div>

      {history ? (
        <VersionHistory
          projectId={projectId}
          item={asset}
          title={spec.label}
          preview={(d) => spec.fields.map((f) => String(d[f.key] ?? "")).filter(Boolean).slice(0, 2).join(" · ")}
          readOnly={locked}
          onRestored={refresh}
          onClose={() => setHistory(false)}
        />
      ) : null}

      {naming ? (
        <NameVersion
          onClose={() => setNaming(false)}
          onSave={async (label) => {
            await act("version", () => saveVersion(projectId, asset.id, label), "Couldn't save the version.");
            setNaming(false);
          }}
          saving={busy === "version"}
        />
      ) : null}
    </section>
  );
}

function AssetField({
  field,
  value,
  locked,
  rewriting,
  disabled,
  error,
  copied,
  onChange,
  onRewrite,
  onCopy,
}: {
  field: FieldSpec;
  value: string;
  locked: boolean;
  rewriting: boolean;
  disabled: boolean;
  error: string;
  copied: boolean;
  onChange: (text: string) => void;
  onRewrite: () => void;
  onCopy: () => void;
}) {
  const id = useId();
  const length = value.length;
  const over = length > field.guidance;
  const describedBy = [`${id}-count`, field.hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  const control =
    "w-full rounded-xl border bg-bg/60 px-4 text-lg text-text placeholder:text-subtle transition-colors " +
    "focus:outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/25 disabled:opacity-60 read-only:bg-surface-2 " +
    (error ? "border-danger" : "border-border-strong hover:border-[#33529a]");

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
          {field.label}
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text"
            aria-label={`Copy ${field.label}`}
          >
            {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
          {locked ? null : (
            <button
              type="button"
              onClick={onRewrite}
              disabled={disabled || rewriting}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-cyan hover:bg-primary/15 disabled:opacity-50"
              aria-label={`Regenerate ${field.label}`}
            >
              {rewriting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {rewriting ? "Rewriting…" : "Regenerate"}
            </button>
          )}
        </div>
      </div>
      {/* Every field wraps, so a long headline can be read in full on a phone. Single-line
          fields still take no line breaks. */}
      <textarea
        id={id}
        value={value}
        maxLength={field.limit}
        rows={field.multiline ? (field.guidance > 400 ? 8 : field.guidance > 150 ? 4 : 3) : 2}
        readOnly={locked}
        disabled={rewriting}
        onChange={(e) => onChange(field.multiline ? e.target.value : e.target.value.replace(/\s*\n\s*/g, " "))}
        onKeyDown={(e) => {
          if (!field.multiline && e.key === "Enter") e.preventDefault();
        }}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${control} py-3 leading-relaxed ${field.multiline ? "resize-y" : "field-sizing-content resize-none"}`}
      />
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-sm">
        <p id={field.hint ? `${id}-hint` : undefined} className="text-subtle">
          {rewriting ? "The AI is rewriting this field. The rest of the asset stays as it is." : field.hint}
        </p>
        <p id={`${id}-count`} className={over ? "font-semibold text-warning" : "text-subtle"}>
          {length} / {field.guidance} characters{over ? " (longer than suggested)" : ""}
        </p>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function NameVersion({ onClose, onSave, saving }: { onClose: () => void; onSave: (label: string) => void; saving: boolean }) {
  const [label, setLabel] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(label);
  }
  return (
    <Dialog title="Save this version" description="Keep a copy you can come back to. A name is optional." onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Version name" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example: sent to the client" />
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" aria-hidden="true" /> Save version
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A rough picture of how the copy reads where it will appear. Not a real ad mock-up. */
function Preview({ assetKey, data, businessName }: { assetKey: string; data: Record<string, string>; businessName: string }) {
  const name = businessName || "Your brand";
  let body = null;
  if (assetKey === "short_ad" || assetKey === "long_ad") {
    body = (
      <div className="max-w-md overflow-hidden rounded-2xl border border-border-strong bg-surface-2 [overflow-wrap:anywhere]">
        <p className="px-4 pt-3 text-sm text-subtle">
          <span className="font-semibold text-text">{name}</span> · Sponsored
        </p>
        <p className="line-clamp-4 px-4 pt-2 text-base whitespace-pre-line text-text">{data.primary_text}</p>
        <div className="mt-3 grid h-32 place-items-center bg-surface-3 text-sm text-subtle">
          <span className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" aria-hidden="true" /> Image from your visual brief
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-base font-bold text-text">{data.headline}</p>
            {data.description ? <p className="line-clamp-2 text-sm text-muted">{data.description}</p> : null}
          </div>
          <span className="shrink-0 rounded-lg bg-surface-3 px-3 py-1.5 text-sm font-semibold text-text">{data.call_to_action}</span>
        </div>
      </div>
    );
  } else if (assetKey === "email") {
    body = (
      <div className="max-w-md rounded-2xl border border-border-strong bg-surface-2 px-4 py-3 [overflow-wrap:anywhere]">
        <p className="text-sm font-semibold text-text">{name}</p>
        <p className="truncate text-base font-bold text-text">{data.subject}</p>
        <p className="truncate text-sm text-muted">{data.preview_text}</p>
      </div>
    );
  } else if (assetKey === "social_post") {
    body = (
      <div className="max-w-md rounded-2xl border border-border-strong bg-surface-2 p-4 [overflow-wrap:anywhere]">
        <p className="text-sm font-semibold text-text">{name}</p>
        <p className="mt-2 line-clamp-5 text-base whitespace-pre-line text-text">{data.caption}</p>
        <p className="mt-2 text-sm text-cyan">{data.hashtags}</p>
      </div>
    );
  }
  if (!body) return null;
  return (
    <div className="mt-8 border-t border-border pt-6">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-subtle">Preview</p>
      {body}
    </div>
  );
}
