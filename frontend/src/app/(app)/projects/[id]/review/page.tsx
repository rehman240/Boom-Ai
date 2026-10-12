"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDashed,
  CircleDot,
  Copy,
  FileDown,
  FileText,
  Loader2,
  Send,
} from "lucide-react";
import { CampaignUnavailable, StageHeader, useCampaign } from "@/components/app/StageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import { assetText, getAssets, type AssetStage } from "@/lib/assets";
import { approveItem } from "@/lib/items";
import { downloadExport, getReview, type ChecklistRow, type ExportFormat, type PartKey, type ReviewStage } from "@/lib/review";

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Where each part of the checklist is made and edited. */
const PART_PAGES: Record<PartKey, string> = {
  brief: "brief",
  target: "target",
  concept: "campaign",
  assets: "creative",
  budget: "budget",
  measurement: "conversions",
};

/** Parts that are one item, so they can be approved right here. Assets are approved one
 * by one in the Creative Workspace, where the user reads them. */
const APPROVE_HERE: PartKey[] = ["target", "concept", "budget", "measurement"];

function StatusIcon({ status }: { status: ChecklistRow["status"] }) {
  if (status === "approved") return <Check className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden="true" />;
  if (status === "waiting") return <CircleDot className="mt-1 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />;
  return <CircleDashed className="mt-1 h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />;
}

const STATUS_WORDS: Record<ChecklistRow["status"], string> = {
  approved: "Approved",
  waiting: "Not approved yet",
  missing: "Not done yet",
};

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCampaign(id);
  const [stage, setStage] = useState<ReviewStage | null>(null);
  const [assets, setAssets] = useState<AssetStage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [review, assetStage] = await Promise.all([getReview(id), getAssets(id)]);
      setStage(review);
      setAssets(assetStage);
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

  async function approve(row: ChecklistRow) {
    setError("");
    setBusy(row.key);
    try {
      for (const itemId of row.item_ids) await approveItem(id, itemId);
      setStage(await getReview(id));
    } catch (e) {
      setError(message(e, "Couldn't approve. Please try again."));
    } finally {
      setBusy("");
    }
  }

  async function download(format: ExportFormat) {
    setError("");
    setBusy(format);
    try {
      await downloadExport(id, format);
    } catch (e) {
      setError(message(e, "The export failed. Please try again."));
    } finally {
      setBusy("");
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? "" : k)), 2000);
    } catch {
      setError("Couldn't copy. Your browser may block the clipboard.");
    }
  }

  if (load.status === "error") return <CampaignUnavailable message={load.message} />;

  const readOnly = load.status === "ready" && load.project.is_demo;
  const name = load.status === "ready" ? load.project.name : "Loading…";
  const approvedCount = stage?.checklist.filter((r) => r.status === "approved").length ?? 0;
  const madeAssets = assets ? assets.spec.filter((s) => assets.assets.some((a) => a.key === s.key)) : [];

  return (
    <>
      <StageHeader
        load={load}
        stage="review"
        eyebrow="07 / Review and export"
        title="Your campaign package"
        subtitle="Check every part before you send it to production or publish it anywhere else."
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

      {error ? <Alert>{error}</Alert> : null}

      {stage ? (
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-3xl border border-border bg-surface p-5 sm:p-8" aria-labelledby="checklist-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-wider text-muted">{name}</p>
                <h2 id="checklist-title" className="mt-1 font-display text-2xl font-bold">
                  Approval checklist
                </h2>
                <p className="mt-1 text-muted">
                  {approvedCount} of {stage.checklist.length} parts approved · {stage.version_label}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                  stage.final ? "border-success/40 bg-success/15 text-success" : "border-warning/40 bg-warning/15 text-warning"
                }`}
              >
                {stage.final ? "Ready to export" : "Draft"}
              </span>
            </div>

            <ul className="mt-6 divide-y divide-border border-t border-border">
              {stage.checklist.map((row) => (
                <li key={row.key} className="flex flex-wrap items-start gap-x-4 gap-y-3 py-4">
                  <StatusIcon status={row.status} />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-semibold">
                      {row.label} <span className="sr-only">: {STATUS_WORDS[row.status]}</span>
                    </p>
                    <p className="text-sm text-muted">{row.detail}</p>
                    {row.flags > 0 ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-warning">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {row.flags === 1 ? "1 claim to check" : `${row.flags} claims to check`} before you publish
                      </p>
                    ) : null}
                  </div>
                  <div className="ml-9 flex items-center gap-3 sm:ml-0">
                    {row.status === "waiting" && APPROVE_HERE.includes(row.key) && !readOnly ? (
                      <Button
                        variant="secondary"
                        className="h-10 px-4 text-sm"
                        onClick={() => approve(row)}
                        loading={busy === row.key}
                        disabled={!!busy}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" /> Approve
                      </Button>
                    ) : null}
                    <Link
                      href={`/projects/${id}/${PART_PAGES[row.key]}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-cyan hover:underline"
                    >
                      {row.status === "missing" ? "Open" : row.key === "assets" && row.status === "waiting" ? "Review" : "View"}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{row.label}</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-6">
            <section className="rounded-3xl border border-border bg-surface p-5 sm:p-7" aria-labelledby="export-title">
              <p className="text-sm font-semibold uppercase tracking-wider text-muted">Export</p>
              <h2 id="export-title" className="mt-1 font-display text-xl font-bold">
                Take the campaign with you
              </h2>
              <p className="mt-2 text-muted">A clean package for your team, producer or advertising partner.</p>
              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan" aria-hidden="true" /> Brief, audience and direction
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan" aria-hidden="true" /> All creative assets
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan" aria-hidden="true" /> Budget and measurement plan
                </li>
              </ul>
              <p className="mt-4 text-sm text-subtle">
                The PDF is ready to share. The Word file can be edited. Both include the version, date, assumptions and
                claims to check.
              </p>
              <p className={`mt-3 text-sm font-semibold ${stage.final ? "text-success" : "text-warning"}`}>
                {stage.status_note}
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <Button onClick={() => download("pdf")} loading={busy === "pdf"} disabled={!!busy}>
                  <FileDown className="h-4 w-4" aria-hidden="true" /> Download PDF
                </Button>
                <Button variant="secondary" onClick={() => download("docx")} loading={busy === "docx"} disabled={!!busy}>
                  <FileDown className="h-4 w-4" aria-hidden="true" /> Download Word
                </Button>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-surface p-5 sm:p-7" aria-labelledby="publish-title">
              <p id="publish-title" className="text-sm font-semibold uppercase tracking-wider text-muted">
                Publication status
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 text-sm font-semibold text-cyan">
                <Send className="h-3.5 w-3.5" aria-hidden="true" /> Not published
              </span>
              <p className="mt-3 text-sm text-muted">Exporting does not post ads, send anything or spend money.</p>
              <p className="mt-2 text-sm text-subtle">{stage.ai_note}</p>
            </section>
          </div>
        </div>
      ) : null}

      {stage && assets ? (
        <section className="mt-6 rounded-3xl border border-border bg-surface p-5 sm:p-8" aria-labelledby="copy-title">
          <h2 id="copy-title" className="font-display text-xl font-bold">
            Copy one asset
          </h2>
          <p className="mt-1 text-muted">Paste a single asset into an email, a document or an ad tool.</p>
          {madeAssets.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No assets yet.{" "}
              <Link href={`/projects/${id}/creative`} className="font-semibold text-cyan hover:underline">
                Open the Creative Workspace
              </Link>
            </p>
          ) : (
            <ul className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              {madeAssets.map((spec) => {
                const asset = assets.assets.find((a) => a.key === spec.key)!;
                return (
                  <li
                    key={spec.key}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{spec.label}</p>
                      <p className={`text-sm ${asset.approved_at ? "text-success" : "text-muted"}`}>
                        {asset.approved_at ? "Approved" : "Not approved yet"} · version {asset.version}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="h-10 shrink-0 px-3 text-sm"
                      onClick={() => copy(spec.key, assetText(spec, asset.data))}
                      aria-label={`Copy ${spec.label}`}
                    >
                      {copied === spec.key ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                      {copied === spec.key ? "Copied" : "Copy"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
