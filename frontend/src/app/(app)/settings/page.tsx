"use client";

import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { useUser } from "@/components/app/UserContext";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SettingsPage() {
  const user = useUser();

  return (
    <>
      <SetBreadcrumbs items={[{ label: user.workspace_name, href: "/overview" }, { label: "Settings" }]} />
      <PageHeader eyebrow="Account" title="Settings" subtitle="Account, privacy, data export and billing." />
      <div className="mt-10 rounded-2xl border border-border bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Signed in as</p>
        <p className="mt-1 text-text">{user.email}</p>
      </div>
    </>
  );
}
