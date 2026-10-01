import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

// Temporary home page. The full landing page is built in Week 3.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col px-4 sm:px-8">
      <header className="flex h-20 items-center justify-between">
        <Logo withProduct />
        <ButtonLink href="/login" variant="ghost">
          Sign in
        </ButtonLink>
      </header>
      <main className="m-auto max-w-3xl py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan">AI campaign workspace</p>
        <h1 className="mt-5 font-display text-5xl leading-[1.05] font-bold tracking-tight sm:text-7xl">
          Make more
          <br />
          <span className="bg-linear-to-r from-cyan to-accent-blue bg-clip-text text-transparent">from your idea.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          Find your audience. Shape the campaign. Create the assets. Plan the budget. Move from idea to a campaign
          you can actually use.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/signup">
            Build a campaign <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
