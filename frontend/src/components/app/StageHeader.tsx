"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { EngineBadge } from "@/components/app/CampaignSetup";
import { useUser } from "@/components/app/UserContext";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar, type StageKey } from "@/components/ui/ProgressBar";
import { api, ApiError } from "@/lib/api";
import { getBrief } from "@/lib/brief";
import type { Project } from "@/lib/projects";

export type CampaignLoad =
  | { status: "loading" }
  | { status: "ready"; project: Project; engine: string; businessName: string }
  | { status: "error"; message: string };

/** The campaign and its AI engine, which every stage page shows at the top. */
export function useCampaign(projectId: string) {
  const [load, setLoad] = useState<CampaignLoad>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<Project>(`/projects/${projectId}`), getBrief(projectId)])
      .then(
        ([project, state]) =>
          !cancelled &&
          setLoad({ status: "ready", project, engine: state.brief.ai_engine, businessName: state.brief.business_name ?? "" }),
      )
      .catch((e: unknown) => {
        if (cancelled) return;
        const notFound = e instanceof ApiError && e.status === 404;
        setLoad({
          status: "error",
          message: notFound ? "This campaign no longer exists." : e instanceof Error ? e.message : "Something went wrong.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return load;
}

/** Stages where the AI writes suggestions (Budget's split comes in Week 3). */
const AI_STAGES: StageKey[] = ["brief", "target", "campaign", "creative", "budget"];

/** The client's rule, said where the AI's work appears: it suggests, the person decides. */
export function AiReviewNote() {
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
      <span>AI suggestions can be wrong. Check every claim before you use it. Nothing is published or spent for you.</span>
    </p>
  );
}

/** Breadcrumb, title, engine badge, progress bar and the read-only notice, the same on every stage. */
export function StageHeader({
  load,
  stage,
  eyebrow,
  title,
  subtitle,
}: {
  load: CampaignLoad;
  stage: StageKey;
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  const user = useUser();
  const name = load.status === "ready" ? load.project.name : "Loading…";

  return (
    <>
      <SetBreadcrumbs
        items={[{ label: user.workspace_name, href: "/overview" }, { label: "Campaigns", href: "/overview" }, { label: name }]}
      />
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      {load.status === "ready" ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <EngineBadge engine={load.engine} />
          {AI_STAGES.includes(stage) ? <AiReviewNote /> : null}
        </div>
      ) : null}
      <div className="mt-8">
        <ProgressBar stage={stage} />
      </div>
      {load.status === "ready" && load.project.is_demo ? (
        <p className="mt-8 flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-sm text-muted">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          This is the example campaign, so it can&apos;t be edited. Duplicate it from the overview to make it yours.
        </p>
      ) : null}
    </>
  );
}

export function CampaignUnavailable({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center" role="alert">
      <p className="font-display text-lg font-semibold">Campaign not available</p>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <ButtonLink href="/overview" className="mt-5" variant="secondary">
        Back to overview
      </ButtonLink>
    </div>
  );
}
