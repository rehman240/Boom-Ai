import type { ReactNode } from "react";
import { BarChart3, FileDown, Images, Lightbulb, Target, Wallet, type LucideIcon } from "lucide-react";

/** One card of the example package. */
function Card({ icon: Icon, label, className = "", children }: { icon: LucideIcon; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-3xl border border-border bg-surface p-6 text-left ${className}`}>
      <p className="flex items-center gap-2 text-base font-semibold uppercase tracking-wider text-cyan">
        <Icon className="h-5 w-5" aria-hidden="true" /> {label}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

const SPLIT = [
  { channel: "Instagram", amount: "$7,200", percent: 60, color: "bg-primary" },
  { channel: "Email", amount: "$4,800", percent: 40, color: "bg-cyan" },
];

/**
 * The sample output the client brief asks for on the landing page: what a finished campaign
 * package looks like, for a made-up product. Static, so it needs no account and no AI.
 */
export function SampleOutput() {
  return (
    <section aria-labelledby="sample-title" className="w-full">
      <p className="text-lg font-semibold text-muted">Example: NOVA Desk Lamp, a made-up product</p>
      <h2 id="sample-title" className="mt-2 font-display text-4xl font-bold sm:text-5xl">
        What you get
      </h2>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card icon={Target} label="Audience">
          <p className="font-display text-2xl font-bold">People who work in more than one place</p>
          <p className="mt-2 text-lg text-muted">They need good light at home, at the office and on the go.</p>
        </Card>

        <Card icon={Lightbulb} label="Campaign">
          <p className="font-display text-2xl font-bold">Light goes where you go</p>
          <p className="mt-2 text-lg text-muted">One portable lamp for every desk you work at.</p>
        </Card>

        <Card icon={Images} label="Ad">
          <p className="text-lg">A week of light on one charge. Three settings for focus, calls and late nights.</p>
          <p className="mt-3 font-display text-xl font-bold">Your desk, anywhere.</p>
          <span className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-base font-semibold text-white">
            Preorder now
          </span>
        </Card>

        <Card icon={Wallet} label="Budget">
          <p className="font-display text-2xl font-bold">$12,000</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {SPLIT.map((s) => (
              <span key={s.channel} className={s.color} style={{ width: `${s.percent}%` }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-lg">
            {SPLIT.map((s) => (
              <li key={s.channel} className="flex justify-between gap-4">
                <span>{s.channel}</span>
                <span className="text-muted">
                  {s.amount} · {s.percent}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card icon={BarChart3} label="Results">
          <p className="text-lg">You enter spend, leads and sales.</p>
          <p className="mt-2 text-lg text-muted">Cost per lead and return on spend are worked out for you.</p>
        </Card>

        <Card icon={FileDown} label="Export">
          <p className="text-lg">PDF and editable Word, ready for your team.</p>
          <p className="mt-2 text-lg text-muted">Nothing is published or paid for until you decide.</p>
        </Card>
      </div>
    </section>
  );
}
