import { ArrowRight, ShieldCheck } from "lucide-react";
import { getImageProps } from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { StepsDiagram } from "@/components/landing/StepsDiagram";
import { APP_NAME } from "@/lib/brand";

// Large on purpose: the client wants the two calls to action to be the biggest things on the page.
const BIG_CTA = "h-18! w-full rounded-2xl! px-12! text-2xl! sm:w-auto sm:min-w-72";

/** The logo art: the tall version on phones, the wide one from tablets up. */
function HeroArt() {
  const common = { alt: `${APP_NAME} logo`, preload: true, sizes: "(min-width: 640px) 72rem, 100vw" };
  const {
    props: { srcSet: wide },
  } = getImageProps({ ...common, src: "/brand/hero-wide.webp", width: 1600, height: 914 });
  const {
    props: { srcSet: tall, ...rest },
  } = getImageProps({ ...common, src: "/brand/hero-tall.webp", width: 800, height: 1422 });
  return (
    <picture>
      <source media="(min-width: 640px)" srcSet={wide} />
      <source srcSet={tall} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
      <img {...rest} className="mx-auto h-auto max-h-[42vh] w-auto rounded-3xl object-cover sm:max-h-[28rem]" />
    </picture>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col px-4 sm:px-8">
      <header className="flex h-20 items-center justify-between">
        <Logo withProduct />
        <ButtonLink href="/login" variant="ghost" className="h-12! px-5! text-lg!">
          Sign in
        </ButtonLink>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 py-8 text-center sm:gap-16 sm:py-12">
        <HeroArt />

        <section aria-labelledby="hero-title">
          <h1 id="hero-title" className="font-display text-5xl leading-[1.05] font-bold tracking-tight sm:text-7xl">
            Make more
            <br />
            <span className="bg-linear-to-r from-cyan to-accent-blue bg-clip-text text-transparent">from your idea.</span>
          </h1>
          <p className="mt-6 font-display text-3xl font-semibold text-cyan sm:text-4xl">#yourworldforyou</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-widest text-text sm:text-3xl">
            WWW.BOOOM.COM<sup className="ml-1 text-lg">™</sup>
          </p>
        </section>

        <StepsDiagram />

        <section aria-label="Get started" className="flex w-full flex-col items-center gap-8">
          <p className="max-w-2xl text-2xl leading-snug text-balance text-muted sm:text-3xl">
            Move from idea to a campaign you can actually use.
          </p>
          <div className="flex w-full flex-col justify-center gap-4 sm:flex-row">
            <ButtonLink href="/signup" className={BIG_CTA}>
              Build a campaign <ArrowRight className="h-6 w-6" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/signup" variant="secondary" className={BIG_CTA}>
              Sign up
            </ButtonLink>
          </div>
          <p className="text-lg text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-cyan underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </section>

        <section
          aria-labelledby="privacy-title"
          className="flex w-full max-w-4xl flex-col items-center gap-4 rounded-3xl border border-border bg-surface p-8 sm:flex-row sm:text-left"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/20 text-cyan">
            <ShieldCheck className="h-9 w-9" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <h2 id="privacy-title" className="font-display text-2xl font-bold sm:text-3xl">
              Your data stays yours.
            </h2>
            <p className="mt-2 text-lg text-muted">
              Built to the principles of Europe&apos;s GDPR and China&apos;s PIPL. We keep only what you enter, behind
              your password.
            </p>
          </div>
          <Link
            href="/privacy"
            className="text-lg font-semibold whitespace-nowrap text-cyan underline underline-offset-4"
          >
            How we handle data
          </Link>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 border-t border-border py-8 text-base text-muted sm:flex-row sm:justify-between">
        <span>#yourworldforyou · WWW.BOOOM.COM™</span>
        <Link href="/privacy" className="font-semibold hover:text-text">
          Privacy and your data
        </Link>
      </footer>
    </div>
  );
}
