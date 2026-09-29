"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { api, ApiError, type User } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { BreadcrumbContext, BreadcrumbTrail, type Crumb } from "./Breadcrumbs";
import { Sidebar } from "./Sidebar";
import { SetUserContext, UserContext } from "./UserContext";

type State = { status: "loading" } | { status: "ready"; user: User } | { status: "error"; message: string };

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "loading" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);

  useEffect(() => {
    let cancelled = false;
    api<User>("/auth/me")
      .then((user) => !cancelled && setState({ status: "ready", user }))
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          // Expired or invalid cookie: clear it first, or /login would bounce straight back here.
          api("/auth/logout", { method: "POST" })
            .catch(() => undefined)
            .finally(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`));
        } else {
          setState({ status: "error", message: e instanceof Error ? e.message : "Something went wrong." });
        }
      });
    return () => {
      cancelled = true;
    };
    // Only on first load or when the user presses "Try again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Close the phone menu with Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  if (state.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center" role="status">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <span className="h-1 w-24 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-cyan" />
          </span>
          <span className="sr-only">Loading your workspace</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-center" role="alert">
          <p className="font-display text-lg font-semibold">We couldn&apos;t load your workspace</p>
          <p className="mt-2 text-sm text-muted">{state.message}</p>
          <Button className="mt-5" onClick={() => { setState({ status: "loading" }); setAttempt((a) => a + 1); }}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { user } = state;

  return (
    <UserContext.Provider value={user}>
      <SetUserContext.Provider value={(next) => setState({ status: "ready", user: next })}>
      <BreadcrumbContext.Provider value={setCrumbs}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2">
        Skip to content
      </a>

      <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen border-r border-border bg-surface/60 lg:block">
          <Sidebar workspaceName={user.workspace_name} />
        </aside>

        {/* Phone and tablet: slide-in menu */}
        {menuOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-surface">
              <button
                className="absolute top-5 right-4 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                autoFocus
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <Sidebar workspaceName={user.workspace_name} onNavigate={() => setMenuOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6 lg:px-10">
            <button
              className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text lg:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="lg:hidden">
              <Logo />
            </span>
            <div className="hidden min-w-0 flex-1 lg:block">
              <BreadcrumbTrail items={crumbs} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden max-w-[220px] truncate text-sm text-subtle sm:block">{user.email}</span>
              <button
                onClick={signOut}
                className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main id="main" className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
      </BreadcrumbContext.Provider>
      </SetUserContext.Provider>
    </UserContext.Provider>
  );
}
