"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Download } from "lucide-react";
import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { useSetUser, useUser } from "@/components/app/UserContext";
import { Button, buttonClass } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { EXPORT_URL, changeEmail, changePassword, deleteAccount, updateWorkspace } from "@/lib/account";
import { api } from "@/lib/api";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

export default function SettingsPage() {
  const user = useUser();
  const setUser = useSetUser();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <SetBreadcrumbs items={[{ label: user.workspace_name, href: "/overview" }, { label: "Settings" }]} />
      <PageHeader eyebrow="Account" title="Settings" subtitle="Account, privacy, your data and billing." />

      <div className="mt-10 space-y-4">
        <Section title="Workspace" description="The name shown in the sidebar and on exports.">
          <SavingForm
            submitLabel="Save name"
            fields={[{ name: "workspace_name", label: "Workspace name", initial: user.workspace_name, maxLength: 120 }]}
            onSubmit={async (v) => setUser(await updateWorkspace(v.workspace_name))}
          />
        </Section>

        <Section title="Email address" description="You sign in with this address. Changing it needs your password.">
          <SavingForm
            submitLabel="Change email"
            clearOnSuccess={["password"]}
            fields={[
              { name: "email", label: "Email address", type: "email", initial: user.email, autoComplete: "email" },
              { name: "password", label: "Current password", type: "password", autoComplete: "current-password" },
            ]}
            onSubmit={async (v) => setUser(await changeEmail(v.email, v.password))}
          />
        </Section>

        <Section title="Password" description="Changing your password signs you out on your other devices.">
          <SavingForm
            submitLabel="Change password"
            clearOnSuccess={["current_password", "new_password"]}
            fields={[
              {
                name: "current_password",
                label: "Current password",
                type: "password",
                autoComplete: "current-password",
              },
              {
                name: "new_password",
                label: "New password",
                type: "password",
                autoComplete: "new-password",
                hint: "At least 8 characters.",
              },
            ]}
            onSubmit={(v) => changePassword(v.current_password, v.new_password)}
          />
        </Section>

        <Section
          title="Your data"
          description="Download everything in this account: your details, every campaign and its brief."
        >
          <a href={EXPORT_URL} download className={buttonClass("secondary")}>
            <Download className="h-4 w-4" aria-hidden="true" /> Download my data (JSON)
          </a>
        </Section>

        <Section title="Privacy" description="What this app stores, and your rights under GDPR and PIPL.">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted marker:text-subtle">
            <li>Your campaigns are private to this account. No one else can open them.</li>
            <li>Passwords are stored as Argon2 hashes. We never store the password itself.</li>
            <li>Usage events record an event name and ids only, never your campaign text.</li>
            <li>Uploaded files are kept in private storage, and are deleted with their campaign.</li>
          </ul>
          <Link href="/privacy" className="mt-4 inline-block text-base font-semibold text-cyan underline underline-offset-4">
            Read the full privacy page
          </Link>
        </Section>

        <Section title="Billing" description="Not part of this release.">
          <p className="text-sm text-muted">
            No card is stored and nothing is charged. Plans and invoices will appear here when billing is added.
          </p>
        </Section>

        <section className="rounded-3xl border border-danger/40 bg-surface p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-danger">Delete account</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Removes your account and every campaign, brief and uploaded file in it. This cannot be undone. Download your
            data first if you want to keep it.
          </p>
          <Button variant="danger" className="mt-5" onClick={() => setConfirmDelete(true)}>
            Delete my account
          </Button>
        </section>
      </div>

      {confirmDelete ? (
        <DeleteAccountDialog
          email={user.email}
          onClose={() => setConfirmDelete(false)}
          onDeleted={async () => {
            // The cookie is already cleared; make sure nothing stale is left behind.
            await api("/auth/logout", { method: "POST" }).catch(() => undefined);
            router.replace("/");
          }}
        />
      ) : null}
    </>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

type FieldSpec = {
  name: string;
  label: string;
  type?: string;
  initial?: string;
  hint?: string;
  maxLength?: number;
  autoComplete?: string;
};

/** A short settings form: fields, one save button, and an inline saved/error message. */
function SavingForm({
  fields,
  submitLabel,
  clearOnSuccess = [],
  onSubmit,
}: {
  fields: FieldSpec[];
  submitLabel: string;
  clearOnSuccess?: string[];
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""])),
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await onSubmit(values);
      setSaved(true);
      if (clearOnSuccess.length) {
        setValues((v) => ({ ...v, ...Object.fromEntries(clearOnSuccess.map((n) => [n, ""])) }));
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-md">
      <div className="space-y-4">
        {fields.map((f) => (
          <Field
            key={f.name}
            label={f.label}
            name={f.name}
            type={f.type ?? "text"}
            hint={f.hint}
            maxLength={f.maxLength}
            autoComplete={f.autoComplete}
            value={values[f.name]}
            onChange={(e) => {
              setSaved(false);
              setValues((v) => ({ ...v, [f.name]: e.target.value }));
            }}
            required
          />
        ))}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <Button type="submit" variant="secondary" loading={saving}>
          {submitLabel}
        </Button>
        {saved ? (
          <span className="flex items-center gap-1.5 text-sm text-success" role="status">
            <Check className="h-4 w-4" aria-hidden="true" /> Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}

function DeleteAccountDialog({
  email,
  onClose,
  onDeleted,
}: {
  email: string;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDeleting(true);
    try {
      await deleteAccount(password);
      await onDeleted();
    } catch (err) {
      setError(message(err));
      setDeleting(false);
    }
  }

  return (
    <Dialog
      title="Delete your account?"
      description={`${email} and every campaign in it will be permanently removed. This cannot be undone.`}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        <Field
          label="Confirm with your password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          required
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={deleting}>
            Delete account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
