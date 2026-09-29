"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { useUser } from "@/components/app/UserContext";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar, type StageKey } from "@/components/ui/ProgressBar";
import { api, ApiError } from "@/lib/api";
import { isStage, stageLabel, type Project } from "@/lib/projects";

type Load = { status: "loading" } | { status: "ready"; project: Project } | { status: "error"; message: string };

/**
 * Campaign stage shell: breadcrumb, title and progress bar. Each stage's own screen is
 * built in its own task; until then this says so rather than showing an empty page.
 */
export default function StagePage() {
  const { id, stage } = useParams<{ id: string; stage: string }>();
  const user = useUser();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api<Project>(`/projects/${id}`)
      .then((project) => !cancelled && setLoad({ status: "ready", project }))
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
  }, [id]);

  if (load.status === "error" || !isStage(stage)) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center" role="alert">
        <p className="font-display text-lg font-semibold">Campaign not available</p>
        <p className="mt-2 text-sm text-muted">
          {load.status === "error" ? load.message : "That campaign step doesn't exist."}
        </p>
        <ButtonLink href="/overview" className="mt-5" variant="secondary">
          Back to overview
        </ButtonLink>
      </div>
    );
  }

  const name = load.status === "ready" ? load.project.name : "Loading…";

  return (
    <>
      <SetBreadcrumbs
        items={[{ label: user.workspace_name }, { label: "Campaigns", href: "/overview" }, { label: name }]}
      />
      <PageHeader eyebrow={name} title={stageLabel(stage)} />

      <div className="mt-8">
        <ProgressBar stage={stage as StageKey} />
      </div>

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
