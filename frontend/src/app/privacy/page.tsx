import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, KeyRound, Lock, ShieldCheck, Trash2, UserX, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy and your data",
  description: `What ${APP_NAME} stores, what it never collects, and your rights under GDPR and PIPL.`,
};

// Written in plain words on purpose. Every line here must stay true of the code: if what the
// app stores changes, this page changes in the same commit.
const PROMISES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: UserX,
    title: "We only keep what you give us",
    text: "Your email, your password (scrambled), and the campaigns you create. No tracking cookies, no ad trackers, no data bought from anyone.",
  },
  {
    icon: Lock,
    title: "Behind your password",
    text: "Every campaign and file is private to your account. Nobody else can open it, not even with a link.",
  },
  {
    icon: KeyRound,
    title: "Passwords are never stored",
    text: "We keep only an Argon2 hash, a one-way scramble. Not even we can read your password.",
  },
  {
    icon: Download,
    title: "Take your data with you",
    text: "Settings → Download my data gives you everything in your account as one file, at any time.",
  },
  {
    icon: Trash2,
    title: "Delete means delete",
    text: "Deleting your account removes it with every campaign, brief and file in it, straight away.",
  },
  {
    icon: ShieldCheck,
    title: "Never sold, never shared for ads",
    text: "Your data is used only to build your campaigns. It is not sold or used for advertising.",
  },
];

const STORED = [
  ["Account", "Email address, workspace name, password hash."],
  ["Campaigns", "The briefs you write and the results the AI makes for you."],
  ["Files", "Logos and reference files you upload, in private storage."],
  ["Usage counts", "An event name and ids only (for example \"campaign created\"), never your campaign text."],
  ["Sign-in cookie", "One cookie that keeps you signed in. It is needed for the app to work."],
] as const;

const LAWS = [
  {
    region: "European Union",
    law: "General Data Protection Regulation (GDPR)",
    links: [
      { label: "Official text (EUR-Lex)", href: "https://eur-lex.europa.eu/eli/reg/2016/679/oj" },
      { label: "European Commission: data protection", href: "https://commission.europa.eu/law/law-topic/data-protection_en" },
    ],
  },
  {
    region: "China",
    law: "Personal Information Protection Law (PIPL)",
    links: [
      { label: "Official text, Chinese (CAC)", href: "https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm" },
      {
        label: "English translation (Stanford DigiChina)",
        href: "https://digichina.stanford.edu/work/translation-personal-information-protection-law-of-the-peoples-republic-of-china-effective-nov-1-2021/",
      },
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 sm:px-8">
      <header className="mx-auto flex h-20 max-w-4xl items-center justify-between">
        <Link href="/" aria-label={`${APP_NAME} home`}>
          <Logo withProduct />
        </Link>
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-muted hover:text-text">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Home
        </Link>
      </header>

      <main className="mx-auto max-w-4xl pt-6 pb-20">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan">Privacy and your data</p>
        <h1 className="mt-3 font-display text-4xl leading-tight font-bold sm:text-5xl">Your data stays yours.</h1>
        <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted">
          {APP_NAME} is built around the principles of Europe&apos;s GDPR and China&apos;s PIPL: collect as little as
          possible, keep it private, and let you see, take and delete it.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {PROMISES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4 rounded-3xl border border-border bg-surface p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/20 text-cyan">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xl font-semibold">{title}</span>
                <span className="mt-1 block text-base leading-relaxed text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <section className="mt-14" aria-labelledby="stored">
          <h2 id="stored" className="font-display text-3xl font-bold">
            Exactly what is stored
          </h2>
          <dl className="mt-5 divide-y divide-border rounded-3xl border border-border bg-surface">
            {STORED.map(([what, detail]) => (
              <div key={what} className="grid gap-1 px-6 py-4 sm:grid-cols-[12rem_1fr]">
                <dt className="text-lg font-semibold">{what}</dt>
                <dd className="text-base text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-14" aria-labelledby="ai">
          <h2 id="ai" className="font-display text-3xl font-bold">
            When the AI works on your campaign
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            The brief you write is sent to the AI engine you chose for that campaign (today: Claude, by Anthropic) only
            to create your results. Under Anthropic&apos;s commercial terms, what we send through their API is not used
            to train their models. Nothing is sent until you press a button that asks the AI for something.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="rights">
          <h2 id="rights" className="font-display text-3xl font-bold">
            Your rights
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-lg text-muted marker:text-cyan">
            <li>
              <strong className="text-text">See and correct</strong>: everything you entered is on screen and can be
              edited.
            </li>
            <li>
              <strong className="text-text">Take it with you</strong>: download all of it from Settings.
            </li>
            <li>
              <strong className="text-text">Erase it</strong>: delete one campaign, or your whole account, from the app.
            </li>
            <li>
              <strong className="text-text">Say no</strong>: the AI only runs when you ask it to.
            </li>
          </ul>
        </section>

        <section className="mt-14" aria-labelledby="laws">
          <h2 id="laws" className="font-display text-3xl font-bold">
            The rules we follow
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {LAWS.map((law) => (
              <div key={law.law} className="rounded-3xl border border-border bg-surface p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan">{law.region}</p>
                <p className="mt-2 text-xl font-semibold">{law.law}</p>
                <ul className="mt-4 space-y-3">
                  {law.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-lg font-semibold text-cyan underline underline-offset-4"
                      >
                        {link.label}
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-subtle">
            This page explains how the app handles data. It is not legal advice or a certificate of compliance.
          </p>
        </section>
      </main>
    </div>
  );
}
