"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { EnginePicker, RolePicker } from "@/components/app/CampaignSetup";
import { ProjectMenu } from "@/components/app/ProjectMenu";
import { useUser } from "@/components/app/UserContext";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AiEngine, UserRole } from "@/lib/brief";
import {
  createProject,
  deleteProject,
  duplicateProject,
  editedWhen,
  getDashboard,
  projectHref,
  renameProject,
  stageLabel,
  statusLabel,
  statusStyle,
  type Dashboard,
  type Project,
} from "@/lib/projects";

type Load = { status: "loading" } | { status: "ready"; data: Dashboard } | { status: "error"; message: string };
type Modal = null | { kind: "create" } | { kind: "rename"; project: Project } | { kind: "delete"; project: Project };

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

export default function OverviewPage() {
  const user = useUser();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [modal, setModal] = useState<Modal>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState("");

  // Used after an action (create, rename, duplicate, delete) so the caller can await it.
  const refresh = useCallback(
    () =>
      getDashboard().then(
        (data) => setLoad({ status: "ready", data }),
        (e: unknown) => setLoad({ status: "error", message: message(e) }),
      ),
    [],
  );

  // First load. Kept separate so a result arriving after the page closes is dropped.
  useEffect(() => {
    let cancelled = false;
    getDashboard().then(
      (data) => !cancelled && setLoad({ status: "ready", data }),
      (e: unknown) => !cancelled && setLoad({ status: "error", message: message(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function onDuplicate(project: Project) {
    setRowError("");
    setBusyId(project.id);
    try {
      await duplicateProject(project.id);
      await refresh();
    } catch (e) {
      setRowError(message(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SetBreadcrumbs items={[{ label: user.workspace_name }, { label: "Overview" }]} />
      <PageHeader
        eyebrow="Workspace"
        title="Your campaigns"
        subtitle="Pick up where you left off or start a new idea."
        actions={
          load.status === "ready" && load.data.projects.length > 0 ? (
            <Button onClick={() => setModal({ kind: "create" })}>
              Create campaign <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />

      {load.status === "loading" ? <Skeleton /> : null}

      {load.status === "error" ? (
        <div className="mt-10 rounded-3xl border border-border bg-surface p-8 text-center" role="alert">
          <p className="font-display text-lg font-semibold">We couldn&apos;t load your campaigns</p>
          <p className="mt-2 text-sm text-muted">{load.message}</p>
          <Button className="mt-5" variant="secondary" onClick={() => { setLoad({ status: "loading" }); refresh(); }}>
            Try again
          </Button>
        </div>
      ) : null}

      {load.status === "ready" ? (
        load.data.projects.length === 0 ? (
          <EmptyState onCreate={() => setModal({ kind: "create" })} />
        ) : (
          <>
            {rowError ? (
              <p className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
                {rowError}
              </p>
            ) : null}

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <ContinueCard project={load.data.projects[0]} />
              <NewCampaignCard onCreate={() => setModal({ kind: "create" })} />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat label="Active campaigns" value={load.data.stats.active_campaigns} />
              <Stat
                label="Assets drafted"
                value={load.data.stats.assets_drafted}
                note="Assets are what you publish: ad text, emails, social posts. They show here once made."
              />
              <Stat label="Ready to export" value={load.data.stats.ready_to_export} />
            </div>

            <section className="mt-4 rounded-3xl border border-border bg-surface" aria-labelledby="recent-heading">
              <div className="flex items-center justify-between px-6 py-5 sm:px-8">
                <h2 id="recent-heading" className="font-display text-lg font-bold">
                  Recent projects
                </h2>
                <span className="text-sm text-subtle">
                  {load.data.projects.length} {load.data.projects.length === 1 ? "campaign" : "campaigns"}
                </span>
              </div>
              <ul className="border-t border-border">
                {load.data.projects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 border-b border-border px-6 py-4 last:border-b-0 sm:px-8"
                  >
                    <div className="min-w-0 flex-1">
                      <Link href={projectHref(p)} className="font-semibold hover:text-cyan">
                        <span className="truncate">{p.name}</span>
                      </Link>
                      <p className="mt-0.5 truncate text-sm text-subtle">
                        {stageLabel(p.stage)} · Edited {editedWhen(p.updated_at)}
                        {p.is_demo ? " · Example" : ""}
                      </p>
                    </div>
                    {/* Status stays visible on a phone: the brief asks for status at a glance. */}
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-sm font-semibold sm:px-3 ${statusStyle(p.status)}`}
                    >
                      {statusLabel(p.status)}
                    </span>
                    <ProjectMenu
                      project={p}
                      busy={busyId === p.id}
                      onRename={() => setModal({ kind: "rename", project: p })}
                      onDuplicate={() => onDuplicate(p)}
                      onDelete={() => setModal({ kind: "delete", project: p })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )
      ) : null}

      {modal?.kind === "create" ? (
        <CreateDialog
          onClose={() => setModal(null)}
          onSubmit={async (name, role, engine) => {
            const project = await createProject(name, role, engine);
            router.push(projectHref(project));
          }}
        />
      ) : null}

      {modal?.kind === "rename" ? (
        <NameDialog
          title="Rename campaign"
          initial={modal.project.name}
          submitLabel="Save name"
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await renameProject(modal.project.id, name);
            setModal(null);
            await refresh();
          }}
        />
      ) : null}

      {modal?.kind === "delete" ? (
        <DeleteDialog
          project={modal.project}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await deleteProject(modal.project.id);
            setModal(null);
            await refresh();
          }}
        />
      ) : null}
    </>
  );
}

function Skeleton() {
  return (
    <div className="mt-10 animate-pulse space-y-4" role="status" aria-label="Loading your campaigns">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-52 rounded-3xl bg-surface lg:col-span-2" />
        <div className="h-52 rounded-3xl bg-surface" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-3xl bg-surface" />
        ))}
      </div>
      <div className="h-56 rounded-3xl bg-surface" />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="relative mt-10 overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-12">
      <Rings />
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-cyan">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-subtle">New campaign</p>
      <h2 className="mt-2 font-display text-2xl font-bold">Start with the idea.</h2>
      <p className="mt-2 max-w-md text-muted">
        A few details about your offer become a working campaign brief. You stay in control of every step.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        Create campaign <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
    </section>
  );
}

function ContinueCard({ project }: { project: Project }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-8 lg:col-span-2">
      <Rings />
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">Continue working</p>
      <h2 className="mt-2 font-display text-2xl font-bold">
        <span className="line-clamp-2">{project.name}</span>
      </h2>
      <p className="mt-2 text-muted">
        Next step: {stageLabel(project.stage)}. Edited {editedWhen(project.updated_at)}.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusStyle(project.status)}`}>
          {statusLabel(project.status)}
        </span>
        <ButtonLink href={projectHref(project)} className="ml-auto">
          Open campaign <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </div>
    </section>
  );
}

function NewCampaignCard({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">New campaign</p>
      <h2 className="mt-2 font-display text-2xl font-bold">Start with the idea.</h2>
      <p className="mt-2 text-muted">A few details about your offer become a working campaign brief.</p>
      <Button className="mt-6" onClick={onCreate}>
        Create campaign <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-2 font-display text-4xl font-bold tabular-nums">{value}</p>
      {note && value === 0 ? <p className="mt-2 text-sm text-subtle">{note}</p> : null}
    </div>
  );
}

/** Decorative rings from the reference screens. */
function Rings() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 -right-32 h-[420px] w-[420px] -translate-y-1/2 rounded-full"
      style={{
        background: "repeating-radial-gradient(circle, rgba(46,200,255,0.12) 0 1px, transparent 1px 20px)",
        maskImage: "radial-gradient(circle, black 25%, transparent 70%)",
      }}
    />
  );
}

/** New campaign: its name, who is making it and which AI engine it runs on, asked up front. */
function CreateDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string, role: UserRole, engine: AiEngine) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [engine, setEngine] = useState<AiEngine>("claude");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter a campaign name.");
    if (!role) return setError("Please choose who you are.");
    setError("");
    setSaving(true);
    try {
      await onSubmit(name.trim(), role, engine);
    } catch (err) {
      setError(message(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      title="Start a new campaign"
      description="Three quick choices. You can change them later in the brief."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} noValidate className="space-y-6">
        <Field
          label="Campaign name"
          name="name"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          placeholder="NOVA Desk Lamp launch"
          required
        />
        <RolePicker value={role} onChange={setRole} />
        <EnginePicker value={engine} onChange={setEngine} />
        {error ? (
          <p className="text-base text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create campaign
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function NameDialog({
  title,
  description,
  initial = "",
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  initial?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter a campaign name.");
    setError("");
    setSaving(true);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(message(err));
      setSaving(false);
    }
  }

  return (
    <Dialog title={title} description={description} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          label="Campaign name"
          name="name"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          placeholder="NOVA Desk Lamp launch"
          error={error}
          required
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  project,
  onClose,
  onConfirm,
}: {
  project: Project;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setError("");
    setDeleting(true);
    try {
      await onConfirm();
    } catch (e) {
      setError(message(e));
      setDeleting(false);
    }
  }

  return (
    <Dialog
      title="Delete this campaign?"
      description={`"${project.name}" and everything in it — brief, uploads and generated work — will be removed. This cannot be undone.`}
      onClose={onClose}
    >
      {error ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} loading={deleting}>
          Delete campaign
        </Button>
      </div>
    </Dialog>
  );
}
