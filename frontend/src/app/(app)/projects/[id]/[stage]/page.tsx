"use client";

import { useParams } from "next/navigation";
import { CampaignUnavailable, StageHeader, useCampaign } from "@/components/app/StageHeader";
import { ButtonLink } from "@/components/ui/Button";
import type { StageKey } from "@/components/ui/ProgressBar";
import { isStage, stageLabel } from "@/lib/projects";

/**
 * Campaign stage shell for the steps not built yet. Each stage's own screen is built in
 * its own task; until then this says so rather than showing an empty page.
 */
export default function StagePage() {
  const { id, stage } = useParams<{ id: string; stage: string }>();
  const load = useCampaign(id);

  if (load.status === "error" || !isStage(stage)) {
    return <CampaignUnavailable message={load.status === "error" ? load.message : "That campaign step doesn't exist."} />;
  }

  const name = load.status === "ready" ? load.project.name : "Loading…";

  return (
    <>
      <StageHeader load={load} stage={stage as StageKey} eyebrow={name} title={stageLabel(stage)} />
      <section className="mt-10 rounded-3xl border border-border bg-surface p-8 sm:p-12">
        <h2 className="font-display text-xl font-bold">This step is being built</h2>
        <p className="mt-2 max-w-md text-muted">
          Your campaign is saved. {stageLabel(stage)} opens here as soon as it&apos;s ready.
        </p>
        <ButtonLink href="/overview" className="mt-6" variant="secondary">
          Back to overview
        </ButtonLink>
      </section>
    </>
  );
}
