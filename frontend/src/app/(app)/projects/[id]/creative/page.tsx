"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Check, Clock, Loader2, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { AssetEditor } from "@/components/app/AssetEditor";
import { CampaignUnavailable, StageHeader, useCampaign } from "@/components/app/StageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import {
  STATUS_LABELS,
  assetStatus,
  generateAssets,
  getAssets,
  type Asset,
  type AssetStage,
  type AssetStatus,
} from "@/lib/assets";
import { isActive } from "@/lib/brief";
import type { Item } from "@/lib/items";

const POLL_MS = 2500;
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const STATUS_ICON: Record<AssetStatus, typeof Check | null> = {
  approved: Check,
  outdated: Clock,
  edited: Pencil,
  draft: null,
  missing: null,
};
const STATUS_STYLE: Record<AssetStatus, string> = {
  approved: "text-success",
  outdated: "text-warning",
  edited: "text-cyan",
  draft: "text-subtle",
  missing: "text-subtle",
};

/** The asset to open, remembered in the address so a refresh comes back to it. */
function initialAsset() {
  if (typeof window === "undefined") return "";
  return decodeURIComponent(window.location.hash.slice(1));
}

export default function CreativePage() {
  const { id } = useParams<{ id: string }>();
  const load = useCampaign(id);
  const [stage, setStage] = useState<AssetStage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [current, setCurrent] = useState(initialAsset);

  const refresh = useCallback(async () => {
    try {
      setStage(await getAssets(id));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e, "Couldn't load the assets."));
    }
  }, [id]);

  useEffect(() => {
    // Loading data on mount; the state is set once the request comes back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const wholeRunning = isActive(stage?.job);
  const anyRunning = wholeRunning || Object.values(stage?.field_jobs ?? {}).some((j) => isActive(j));

  // Field rewrites and whole runs live on the server; the page polls while any is running.
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);

  const readOnly = load.status === "ready" && load.project.is_demo;

  function open(key: string) {
    setCurrent(key);
    window.history.replaceState(null, "", `#${encodeURIComponent(key)}`);
    // The editor for the new asset mounts on the next frame; move focus to its title then.
    requestAnimationFrame(() => document.getElementById("asset-title")?.focus({ preventScroll: true }));
  }

  /** An autosave came back: show the server's copy of that asset without reloading everything. */
  const onItem = useCallback((item: Item) => {
    setStage((s) =>
      s && {
        ...s,
        assets: s.assets.map((a) =>
          a.id === item.id
            ? { ...a, data: item.data as Record<string, string>, version: item.version, unsaved_changes: item.unsaved_changes, approved_at: item.approved_at, updated_at: item.updated_at }
            : a,
        ),
      },
    );
  }, []);

  async function generate() {
    setError("");
    setBusy("generate");
    try {
      await generateAssets(id);
      await refresh();
    } catch (e) {
      setError(message(e, "Couldn't start. Please try again."));
    } finally {
      setBusy("");
    }
  }

  if (load.status === "error") return <CampaignUnavailable message={load.message} />;

  const assets = stage?.assets ?? [];
  const byKey = new Map(assets.map((a) => [a.key, a] as [string, Asset]));
  const spec = stage?.spec ?? [];
  const selectedSpec = spec.find((s) => s.key === current && byKey.has(s.key)) ?? spec.find((s) => byKey.has(s.key));
  const selected = selectedSpec ? byKey.get(selectedSpec.key) : undefined;
  const approvedCount = assets.filter((a) => a.approved_at).length;
  const failed = stage?.job?.status === "failed" && !wholeRunning ? stage.job : null;

  return (
    <>
      <StageHeader
        load={load}
        stage="creative"
        eyebrow="04 / Creative workspace"
        title="Make the campaign usable"
        subtitle="Edit each asset directly. Regenerate changes only the field you choose, and every version is kept."
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
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading assets…
        </p>
      ) : null}

      {stage?.blocked_reason ? (
        <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <h2 className="font-display text-xl font-bold">First, choose a campaign direction</h2>
          <p className="mt-2 max-w-xl text-muted">{stage.blocked_reason} Every asset is written from the direction you choose.</p>
          <ButtonLink href={`/projects/${id}/campaign`} className="mt-6">
            Go to Generate Campaign <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
        </section>
      ) : null}

      {stage && !stage.blocked_reason ? (
        <>
          {error ? <Alert>{error}</Alert> : null}
          {failed ? (
            <Alert>
              {failed.error} {assets.length ? "Your assets are unchanged." : ""}
              {readOnly ? null : (
                <Button variant="secondary" className="mt-3 h-10 px-4 text-sm" onClick={generate} loading={busy === "generate"}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
                </Button>
              )}
            </Alert>
          ) : null}

          {wholeRunning ? (
            <section className="mt-10 rounded-3xl border border-cyan/40 bg-primary/10 p-6 sm:p-8" role="status" aria-live="polite">
              <p className="flex items-center gap-3 font-display text-xl font-bold">
                <Loader2 className="h-6 w-6 animate-spin text-cyan" aria-hidden="true" />
                {assets.length ? "Rewriting the assets you haven't touched…" : "Writing your seven assets…"}
              </p>
              <p className="mt-2 max-w-2xl text-muted">
                This usually takes under a minute. It keeps going if you leave or refresh this page.
                {assets.length ? " Assets you edited, saved or approved stay as they are." : ""}
              </p>
            </section>
          ) : null}

          {!assets.length && !wholeRunning ? (
            <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-10">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Ready when you are
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">Turn your direction into copy</h2>
              <p className="mt-2 max-w-2xl text-muted">
                The AI writes seven assets from your chosen direction: a campaign overview, a landing page outline, short and
                long ad copy, an email, a social post and a brief for photos or design. Every field can be edited or rewritten on
                its own. No images are generated; you get clear directions for them instead.
              </p>
              {readOnly ? null : (
                <Button onClick={generate} loading={busy === "generate"} className="mt-6">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Write the assets
                </Button>
              )}
            </section>
          ) : null}

          {assets.length && selectedSpec && selected ? (
            <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
              <nav aria-label="Assets" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
                <div className="lg:hidden">
                  <label htmlFor="asset-picker" className="mb-2 block text-sm font-semibold uppercase tracking-[0.12em] text-subtle">
                    Asset
                  </label>
                  <select
                    id="asset-picker"
                    value={selectedSpec.key}
                    onChange={(e) => open(e.target.value)}
                    className="h-14 w-full rounded-xl border border-border-strong bg-surface px-4 text-lg text-text focus:border-cyan focus:ring-2 focus:ring-cyan/25 focus:outline-none"
                  >
                    {spec.map((s) => (
                      <option key={s.key} value={s.key} disabled={!byKey.has(s.key)}>
                        {s.label} ({STATUS_LABELS[assetStatus(byKey.get(s.key))]})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hidden rounded-3xl border border-border bg-surface p-3 lg:block">
                  <p className="px-3 pt-2 pb-3 text-sm font-semibold uppercase tracking-[0.14em] text-subtle">Assets</p>
                  <ul className="space-y-1">
                    {spec.map((s) => {
                      const status = assetStatus(byKey.get(s.key));
                      const Icon = STATUS_ICON[status];
                      const active = s.key === selectedSpec.key;
                      return (
                        <li key={s.key}>
                          <button
                            type="button"
                            onClick={() => open(s.key)}
                            disabled={!byKey.has(s.key)}
                            aria-current={active ? "true" : undefined}
                            className={
                              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-base transition-colors disabled:opacity-50 " +
                              (active ? "border border-primary/60 bg-primary/20 font-semibold text-text" : "border border-transparent text-muted hover:bg-surface-2 hover:text-text")
                            }
                          >
                            <span>{s.label}</span>
                            <span className={`flex shrink-0 items-center gap-1 text-sm ${STATUS_STYLE[status]}`}>
                              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                              {STATUS_LABELS[status]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="border-t border-border px-3 pt-3 pb-1 text-sm text-subtle">
                    {approvedCount} of {spec.length} approved
                  </p>
                </div>
              </nav>

              <AssetEditor
                key={selected.id}
                projectId={id}
                spec={selectedSpec}
                asset={selected}
                businessName={load.status === "ready" ? load.businessName : ""}
                readOnly={readOnly}
                fieldJobs={stage.field_jobs}
                onItem={onItem}
                refresh={refresh}
              />
            </div>
          ) : null}

          {assets.length && !readOnly ? (
            // Sticky on large screens only, with room on the right for the round audio guide
            // button. On phones it ends the page, with space below so the button never covers it.
            <div className="mt-8 mb-24 rounded-2xl border border-border bg-bg/95 px-4 py-4 lg:sticky lg:bottom-0 lg:z-10 lg:mb-0 lg:pr-24 lg:backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted" role="status">
                    <span className="font-semibold text-text">
                      {approvedCount} of {spec.length}
                    </span>{" "}
                    assets approved.
                  </p>
                  <p className="mt-1 text-sm text-subtle">Writing again replaces only assets you haven&apos;t edited, saved or approved.</p>
                </div>
                <div className="flex flex-col gap-3 whitespace-nowrap sm:shrink-0 sm:flex-row">
                  <Button variant="secondary" onClick={generate} loading={busy === "generate"} disabled={anyRunning}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Write again
                  </Button>
                  <ButtonLink href={`/projects/${id}/budget`}>
                    Continue to budget <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </ButtonLink>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
