"use client";

import { Plus, Sparkles } from "lucide-react";
import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { useUser } from "@/components/app/UserContext";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

export default function OverviewPage() {
  const user = useUser();

  return (
    <>
      <SetBreadcrumbs items={[{ label: user.workspace_name }, { label: "Overview" }]} />
      <PageHeader eyebrow="Workspace" title="Your campaigns" subtitle="Pick up where you left off or start a new idea." />

      {/* Empty state. The project list and create flow come with the dashboard task. */}
      <section className="relative mt-10 overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -right-32 h-[420px] w-[420px] -translate-y-1/2 rounded-full"
          style={{
            background: "repeating-radial-gradient(circle, rgba(90,209,255,0.12) 0 1px, transparent 1px 20px)",
            maskImage: "radial-gradient(circle, black 25%, transparent 70%)",
          }}
        />
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-cyan">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">New campaign</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Start with the idea.</h2>
        <p className="mt-2 max-w-md text-muted">
          A few details about your offer become a working campaign brief. You stay in control of every step.
        </p>
        <Button className="mt-6" disabled title="Coming in the next step">
          Create campaign <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </section>
    </>
  );
}
