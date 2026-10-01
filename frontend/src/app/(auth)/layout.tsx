import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/brand";

const CAPABILITIES = [
  { n: "01", title: "Generate Campaign", text: "Make the idea concrete", dot: "bg-accent-blue" },
  { n: "02", title: "Identify Target", text: "Know who it speaks to", dot: "bg-accent-green" },
  { n: "03", title: "Manage Conversions", text: "Measure the response", dot: "bg-accent-red" },
  { n: "04", title: "Allocate Budget", text: "Put resources to work", dot: "bg-cyan" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface/50 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -right-40 h-[560px] w-[560px] -translate-y-1/2 rounded-full"
          style={{
            background:
              "repeating-radial-gradient(circle, rgba(46,200,255,0.10) 0 1px, transparent 1px 22px)",
            maskImage: "radial-gradient(circle, black 30%, transparent 70%)",
          }}
        />
        <Link href="/" aria-label={`${APP_NAME} home`}>
          <Logo withProduct />
        </Link>

        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan">AI campaign workspace</p>
          <h2 className="mt-4 font-display text-5xl leading-[1.05] font-bold tracking-tight">
            Make more
            <br />
            <span className="bg-linear-to-r from-cyan to-accent-blue bg-clip-text text-transparent">from your idea.</span>
          </h2>
          <p className="mt-5 text-lg text-muted">
            Find your audience. Shape the campaign. Create the assets. Plan the budget.
          </p>
        </div>

        <ul className="relative grid grid-cols-2 gap-x-6 gap-y-5">
          {CAPABILITIES.map((c) => (
            <li key={c.n} className="flex gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.dot}`} aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-text">{c.title}</span>
                <span className="block text-sm text-subtle">{c.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Form */}
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="lg:hidden" aria-label={`${APP_NAME} home`}>
          <Logo withProduct />
        </Link>
        <div className="m-auto w-full max-w-sm py-10">{children}</div>
        <p className="text-center text-xs text-subtle">AI suggests. You decide. Nothing is published or spent for you.</p>
      </main>
    </div>
  );
}
