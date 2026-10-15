import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Usage policy",
  description: `What you may and may not use ${APP_NAME} for.`,
};

// Our own wording. The structure follows common AI usage policies: rules for everyone,
// extra care for high-risk topics, rules specific to advertising, then enforcement.
const SECTIONS: { id: string; title: string; intro: string; items: string[] }[] = [
  {
    id: "everyone",
    title: "Rules for everyone",
    intro: `Do not use ${APP_NAME} to create, plan or promote any of the following:`,
    items: [
      "Anything illegal where you or your audience live, or anything that helps someone break the law.",
      "Weapons, explosives, dangerous chemicals or anything designed to cause physical harm.",
      "Attacks on computer systems, malware, phishing or attempts to get around security.",
      "Violence, threats, harassment, hate or discrimination against people or groups.",
      "Content that sexualises minors or puts children at risk in any way.",
      "Sexually explicit material.",
      "Collecting, tracking or exposing people's personal data without their permission.",
      "Fraud, scams, pyramid schemes, fake charities or other ways to cheat people out of money.",
      "False information presented as fact, or content meant to mislead voters or interfere with elections.",
      "Self-harm, eating disorders or anything that encourages people to hurt themselves.",
    ],
  },
  {
    id: "advertising",
    title: "Rules for campaigns and ads",
    intro: "Because this is a marketing tool, these rules matter most:",
    items: [
      "No fake reviews, testimonials, endorsements, results or statistics. Use only facts you can back up.",
      "Do not pretend to be another person, brand or organisation, or use their name or logo without permission.",
      "Do not make misleading claims about price, quality, origin or what a product can do.",
      "Do not target people based on sensitive traits (health, religion, sexuality, ethnicity) to exploit them.",
      "Follow the advertising rules of every platform and country where your campaign will run.",
      "Do not promote products or services that are illegal to sell to your audience.",
    ],
  },
  {
    id: "high-risk",
    title: "Topics that need a human check",
    intro:
      "Campaigns about these topics can affect people's health, money or rights. A qualified person must review them before they are used, and the audience should know AI helped write them:",
    items: [
      "Health, medicine, supplements and wellness claims.",
      "Finance, investing, loans, insurance and crypto.",
      "Legal services and legal advice.",
      "Jobs, housing and education offers.",
    ],
  },
];

export default function UsagePolicyPage() {
  return (
    <div className="min-h-screen px-4 sm:px-8">
      <header className="mx-auto flex h-20 max-w-4xl items-center justify-between">
        <Link href="/" aria-label={`${APP_NAME} home`}>
          <Logo withProduct />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-muted hover:text-text">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl pt-6 pb-20">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan">Usage policy</p>
        <h1 className="mt-3 font-display text-4xl leading-tight font-bold sm:text-5xl">Use it to build, not to harm.</h1>
        <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted">
          {APP_NAME} helps you plan honest campaigns. By using it you agree to these rules. They apply to everything
          you enter and everything you make with it.
        </p>

        {SECTIONS.map((section) => (
          <section key={section.id} className="mt-14" aria-labelledby={section.id}>
            <h2 id={section.id} className="font-display text-3xl font-bold">
              {section.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">{section.intro}</p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-lg text-muted marker:text-cyan">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-14" aria-labelledby="yours">
          <h2 id="yours" className="font-display text-3xl font-bold">
            You stay responsible
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            The AI suggests, you decide. {APP_NAME} never publishes or spends money for you. Check every result before
            you use it, and you are responsible for what you publish.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="enforcement">
          <h2 id="enforcement" className="font-display text-3xl font-bold">
            If the rules are broken
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            We may refuse a request, remove content, or suspend or close an account that breaks this policy. Where the
            law requires it, we may report illegal activity. We may update this policy; the latest version is always on
            this page.
          </p>
          <p className="mt-6 text-sm text-subtle">
            See also{" "}
            <Link href="/privacy" className="font-semibold text-cyan underline underline-offset-2">
              Privacy and your data
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
