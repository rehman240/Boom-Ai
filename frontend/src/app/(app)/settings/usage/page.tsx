"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { SetBreadcrumbs } from "@/components/app/Breadcrumbs";
import { useUser } from "@/components/app/UserContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { STEP_NAMES, getUsage, tokens, usd, type UsageReport, type UsageRow } from "@/lib/usage";

type Load = { status: "loading" } | { status: "ready"; data: UsageReport } | { status: "error"; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function UsagePage() {
  const user = useUser();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getUsage().then(
      (data) => !cancelled && setLoad({ status: "ready", data }),
      (e: unknown) => !cancelled && setLoad({ status: "error", message: message(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SetBreadcrumbs
        items={[
          { label: user.workspace_name, href: "/overview" },
          { label: "Settings", href: "/settings" },
          { label: "AI usage" },
        ]}
      />
      <PageHeader
        eyebrow="Account"
        title="AI usage"
        subtitle="What the AI generations in this account used, in tokens and dollars."
      />

      {load.status === "loading" ? <p className="mt-10 text-muted" role="status">Loading usage…</p> : null}
      {load.status === "error" ? <Alert>{load.message}</Alert> : null}
      {load.status === "ready" ? <Report data={load.data} /> : null}
    </>
  );
}

function Report({ data }: { data: UsageReport }) {
  const since = data.recorded_since
    ? new Date(data.recorded_since).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="mt-10 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[data.today, data.this_month, data.all_time].map((t) => (
          <section key={t.label} className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-subtle">{t.label}</h2>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">{usd(t.cost_usd)}</p>
            <p className="mt-1 text-sm text-muted">
              {tokens(t.calls)} {t.calls === 1 ? "call" : "calls"} · {tokens(t.input_tokens + t.output_tokens)} tokens
            </p>
          </section>
        ))}
      </div>

      <section className="rounded-3xl border border-border bg-surface p-6 text-sm text-muted sm:p-8">
        <ul className="list-disc space-y-2 pl-5 marker:text-subtle">
          <li>
            {since
              ? `Recorded since ${since}. Calls made before then are not in this report.`
              : "Nothing recorded yet. Usage appears here after the next AI generation."}{" "}
            For the full history and the exact bill, see the Usage and Cost pages in the AI provider&apos;s console.
          </li>
          <li>
            Costs are estimates at ${data.price_input_per_mtok} per million input tokens and $
            {data.price_output_per_mtok} per million output tokens.
          </li>
          <li>Failed attempts and automatic retries are counted, because they are billed too.</li>
          <li>Days and months are in UTC. Only numbers are logged here, never your campaign text.</li>
        </ul>
      </section>

      {data.all_time.calls ? (
        <>
          <Table title="By step" first="Step" rows={data.by_step} name={(l) => STEP_NAMES[l] ?? l} />
          <Table title="By campaign" first="Campaign" rows={data.by_project} />
          <Table title="By day (last 30 days)" first="Day" rows={data.by_day} name={dateLabel} />
          <Table title="By model" first="Model" rows={data.by_model} />
        </>
      ) : null}

      <p className="pt-2">
        <Link href="/settings" className="text-base font-semibold text-cyan underline underline-offset-4">
          Back to settings
        </Link>
      </p>
    </div>
  );
}

function Table({
  title,
  first,
  rows,
  name = (l) => l,
}: {
  title: string;
  first: string;
  rows: UsageRow[];
  name?: (label: string) => string;
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left">
          <caption className="sr-only">AI usage {title.toLowerCase()}</caption>
          <thead>
            <tr className="border-b border-border text-sm uppercase tracking-[0.1em] text-subtle">
              <th scope="col" className="py-2 pr-3 font-semibold">{first}</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Calls</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Input tokens</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Output tokens</th>
              <th scope="col" className="py-2 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className="border-b border-border">
                <th scope="row" className="py-3 pr-3 font-semibold">{name(r.label)}</th>
                <td className="py-3 pr-3 text-right tabular-nums">{tokens(r.calls)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{tokens(r.input_tokens)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{tokens(r.output_tokens)}</td>
                <td className="py-3 text-right tabular-nums">{usd(r.cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
