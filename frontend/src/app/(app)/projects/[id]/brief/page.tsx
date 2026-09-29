"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Check, CloudOff, Loader2, Lock } from "lucide-react";
import { BrandAssets } from "@/components/app/BrandAssets";
import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { useUser } from "@/components/app/UserContext";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ChipGroup, Select, Textarea } from "@/components/ui/Inputs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { api, ApiError } from "@/lib/api";
import {
  BRAND_VOICES,
  CHANNELS,
  EMPTY_DRAFT,
  GOALS,
  REQUIRED_LABELS,
  getBrief,
  saveBrief,
  toDraft,
  type BriefDraft,
} from "@/lib/brief";
import type { Project } from "@/lib/projects";
import { useAutosave } from "@/lib/useAutosave";

type Load =
  | { status: "loading" }
  | { status: "ready"; project: Project }
  | { status: "error"; message: string };

type Errors = Partial<Record<keyof BriefDraft, string>>;

/** Dates and money are empty strings in the form but null in the API. */
function toApi(changes: Partial<BriefDraft>): Partial<BriefDraft> {
  const out: Record<string, unknown> = { ...changes };
  for (const key of ["budget_amount", "start_date", "end_date"]) {
    if (out[key] === "") out[key] = null;
  }
  return out as Partial<BriefDraft>;
}

function validate(draft: BriefDraft): Errors {
  const errors: Errors = {};
  if (draft.product_url && !/^https?:\/\//i.test(draft.product_url)) {
    errors.product_url = "Start the address with http:// or https://";
  }
  if (draft.budget_amount && !(Number(draft.budget_amount) >= 0)) {
    errors.budget_amount = "Enter an amount, for example 12000.";
  }
  if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
    errors.end_date = "The end date can't be before the start date.";
  }
  return errors;
}

export default function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [draft, setDraft] = useState<BriefDraft>(EMPTY_DRAFT);
  const [missing, setMissing] = useState<string[]>(Object.keys(REQUIRED_LABELS));
  const [errors, setErrors] = useState<Errors>({});

  const autosave = useAutosave<BriefDraft>(async (changes) => {
    const state = await saveBrief(id, toApi(changes));
    setMissing(state.missing_required);
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<Project>(`/projects/${id}`), getBrief(id)]).then(
      ([project, state]) => {
        if (cancelled) return;
        setDraft(toDraft(state.brief));
        setMissing(state.missing_required);
        setLoad({ status: "ready", project });
      },
      (e: unknown) => {
        if (cancelled) return;
        const gone = e instanceof ApiError && e.status === 404;
        setLoad({
          status: "error",
          message: gone ? "This campaign no longer exists." : e instanceof Error ? e.message : "Something went wrong.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const readOnly = load.status === "ready" && load.project.is_demo;

  function set<K extends keyof BriefDraft>(key: K, value: BriefDraft[K]) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (readOnly) return;

    const nextErrors = validate(next);
    // A field that was invalid and is now fine gets saved too, so fixing the start date
    // also saves the end date that was blocked by it.
    const recovered = Object.keys(errors).filter((k) => !nextErrors[k as keyof BriefDraft]) as (keyof BriefDraft)[];
    setErrors(nextErrors);

    const changes: Partial<BriefDraft> = {};
    for (const k of [key, ...recovered]) {
      if (!nextErrors[k]) Object.assign(changes, { [k]: next[k] });
    }
    if (Object.keys(changes).length) autosave.queue(changes);
  }

  if (load.status === "error") {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center" role="alert">
        <p className="font-display text-lg font-semibold">Campaign not available</p>
        <p className="mt-2 text-sm text-muted">{load.message}</p>
        <ButtonLink href="/overview" className="mt-5" variant="secondary">
          Back to overview
        </ButtonLink>
      </div>
    );
  }

  const name = load.status === "ready" ? load.project.name : "Loading…";
  const ready = missing.length === 0 && Object.keys(errors).length === 0;
  const disabled = load.status !== "ready" || readOnly;

  return (
    <>
      <SetBreadcrumbs
        items={[{ label: user.workspace_name, href: "/overview" }, { label: "Campaigns", href: "/overview" }, { label: name }]}
      />
      <PageHeader
        eyebrow="01 / Campaign brief"
        title="Tell us what you are building"
        subtitle="Start with the facts. BOOOM More turns them into an editable campaign brief, and only uses what you enter here."
      />

      <div className="mt-8">
        <ProgressBar stage="brief" />
      </div>

      {readOnly ? (
        <p className="mt-8 flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-sm text-muted">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          This is the example campaign, so it can&apos;t be edited. Duplicate it from the overview to make it yours.
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">Your offer</h2>
              <SaveIndicator {...autosave} readOnly={readOnly} />
            </div>

            <div className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Business name"
                  name="business_name"
                  value={draft.business_name}
                  onChange={(e) => set("business_name", e.target.value)}
                  maxLength={200}
                  disabled={disabled}
                  placeholder="NOVA"
                  required
                />
                <Field
                  label="Product or service"
                  name="product_or_service"
                  value={draft.product_or_service}
                  onChange={(e) => set("product_or_service", e.target.value)}
                  maxLength={300}
                  disabled={disabled}
                  placeholder="Rechargeable desk lamp"
                  required
                />
              </div>

              <Field
                label="Product link"
                name="product_url"
                type="url"
                value={draft.product_url}
                onChange={(e) => set("product_url", e.target.value)}
                maxLength={500}
                disabled={disabled}
                error={errors.product_url}
                placeholder="https://example.com/desk-lamp"
                hint="Stored with your brief for reference. Nothing is read from the page."
              />

              <Textarea
                label="One sentence description"
                name="description"
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={2000}
                disabled={disabled}
                placeholder="A portable lamp for people who work in more than one place."
                required
              />

              <Textarea
                label="What makes it different?"
                name="differentiators"
                value={draft.differentiators}
                onChange={(e) => set("differentiators", e.target.value)}
                maxLength={2000}
                disabled={disabled}
                placeholder="Three light settings and a battery that lasts a week."
                required
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold">The campaign</h2>
            <div className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Select
                  label="Campaign goal"
                  name="goal"
                  options={GOALS}
                  value={draft.goal}
                  onChange={(e) => set("goal", e.target.value)}
                  disabled={disabled}
                  placeholder="What should people do?"
                  required
                />
                <Field
                  label="Target location"
                  name="target_location"
                  value={draft.target_location}
                  onChange={(e) => set("target_location", e.target.value)}
                  maxLength={200}
                  disabled={disabled}
                  placeholder="United States"
                  hint="This release plans campaigns in English for the US."
                  required
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <Field
                  label="Media budget (USD)"
                  name="budget_amount"
                  type="number"
                  min={0}
                  step={100}
                  value={draft.budget_amount}
                  onChange={(e) => set("budget_amount", e.target.value)}
                  disabled={disabled}
                  error={errors.budget_amount}
                  placeholder="12000"
                  required
                />
                <Field
                  label="Start date"
                  name="start_date"
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  disabled={disabled}
                />
                <Field
                  label="End date"
                  name="end_date"
                  type="date"
                  value={draft.end_date}
                  onChange={(e) => set("end_date", e.target.value)}
                  disabled={disabled}
                  error={errors.end_date}
                />
              </div>

              <ChipGroup
                label="Channels of interest"
                options={CHANNELS}
                value={draft.channels}
                onChange={(next) => set("channels", next)}
                hint="Optional. Leave this empty and the budget step will suggest channels for you."
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold">Voice and limits</h2>
            <div className="mt-6 space-y-5">
              <ChipGroup
                label="Brand voice"
                options={BRAND_VOICES}
                value={draft.brand_voice}
                onChange={(next) => set("brand_voice", next)}
              />
              <Textarea
                label="Price or offer terms"
                name="offer_terms"
                value={draft.offer_terms}
                onChange={(e) => set("offer_terms", e.target.value)}
                maxLength={2000}
                disabled={disabled}
                placeholder="$89, with 20% off the first 500 preorders."
                hint="Only what you write here can appear in your ads. Prices are never invented."
              />
              <Textarea
                label="Anything to avoid"
                name="exclusions"
                value={draft.exclusions}
                onChange={(e) => set("exclusions", e.target.value)}
                maxLength={2000}
                disabled={disabled}
                placeholder="No health claims. Don't mention competitors by name."
              />
            </div>
          </section>
        </div>

        {/* Sticky on wide screens, so the required-fields checklist stays in view while
            the form is filled in. */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {load.status === "ready" ? <BrandAssets projectId={id} readOnly={readOnly} /> : null}

          <section className="rounded-3xl border border-border bg-surface p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Before generation</p>
            <p className="mt-2 text-sm text-muted">
              Review the brief and confirm the extracted facts before generating ideas.
            </p>
            <ul className="mt-5 space-y-2">
              {Object.entries(REQUIRED_LABELS).map(([key, label]) => {
                const done = !missing.includes(key);
                return (
                  <li key={key} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border " +
                        (done ? "border-success/50 bg-success/15 text-success" : "border-border-strong text-subtle")
                      }
                    >
                      {done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    </span>
                    <span className={done ? "text-muted" : "text-subtle"}>{label}</span>
                    <span className="sr-only">{done ? "filled in" : "still needed"}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="rounded-3xl border border-border bg-surface p-6">
            <Button
              className="w-full"
              disabled
              title={
                ready
                  ? "The AI summary of your brief opens here in the next step"
                  : "Fill in the required fields first"
              }
            >
              Review brief <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <p className="mt-3 text-xs text-subtle">
              {ready
                ? "Everything needed is filled in. The AI summary of your brief is the next step to be built."
                : `${missing.length} required ${missing.length === 1 ? "field" : "fields"} still to fill in.`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function SaveIndicator({
  status,
  error,
  retry,
  readOnly,
}: {
  status: string;
  error: string;
  retry: () => void;
  readOnly: boolean;
}) {
  if (readOnly) return null;

  if (status === "error") {
    return (
      <span className="flex items-center gap-2 text-sm text-danger" role="alert">
        <CloudOff className="h-4 w-4" aria-hidden="true" />
        {error || "Not saved."}
        <button onClick={retry} className="font-semibold underline underline-offset-2 hover:text-text">
          Retry
        </button>
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="flex items-center gap-2 text-sm text-subtle" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-2 text-sm text-success" role="status">
        <Check className="h-4 w-4" aria-hidden="true" /> Autosaved
      </span>
    );
  }
  return <span className="text-sm text-subtle">Changes save automatically</span>;
}
