"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Gem, LayoutGrid, Settings, Sparkles, Target, Wallet, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/brand";

type NavItem = { label: string; href?: string; stage?: string; icon: LucideIcon };

// Campaigns, Audiences, Creative, Budgets and Results are shortcuts into the open campaign's
// stages. Outside a campaign there is nothing to open, so they are shown but disabled.
const NAV: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutGrid },
  { label: "Campaigns", stage: "campaign", icon: Sparkles },
  { label: "Audiences", stage: "target", icon: Target },
  { label: "Creative", stage: "creative", icon: Gem },
  { label: "Budgets", stage: "budget", icon: Wallet },
  { label: "Results", stage: "conversions", icon: BarChart3 },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function Sidebar({ workspaceName, onNavigate }: { workspaceName: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const campaign = pathname.match(/^\/projects\/([^/]+)/)?.[1];

  const itemClass = (active: boolean) =>
    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors " +
    (active
      ? "bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--border-strong)]"
      : "text-muted hover:bg-surface-2 hover:text-text");

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-8">
        <Link href="/overview" onClick={onNavigate} aria-label={`${APP_NAME} home`}>
          <Logo />
        </Link>
      </div>

      <nav aria-label="Workspace" className="flex-1 px-3">
        <p className="px-3 pb-3 text-sm font-semibold uppercase tracking-[0.14em] text-subtle">Workspace</p>
        <ul className="space-y-1">
          {NAV.map(({ label, href: fixed, stage, icon: Icon }) => {
            const href = stage ? (campaign ? `/projects/${campaign}/${stage}` : undefined) : fixed;
            const active = href ? pathname.startsWith(href) : false;
            return (
              <li key={label}>
                {href ? (
                  <Link href={href} onClick={onNavigate} className={itemClass(active)} aria-current={active ? "page" : undefined}>
                    <Icon className={`h-4 w-4 ${active ? "text-cyan" : ""}`} aria-hidden="true" />
                    {label}
                  </Link>
                ) : (
                  <span className={`${itemClass(false)} cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted`} aria-disabled="true" title="Open a campaign first">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-3 py-4">
        <Link href="/settings" onClick={onNavigate} className={itemClass(pathname.startsWith("/settings"))}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <div className="mt-3 flex items-center gap-3 px-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-3 text-sm font-bold text-cyan" aria-hidden="true">
            {initials(workspaceName) || "W"}
          </span>
          <span className="truncate text-sm text-muted">{workspaceName}</span>
        </div>
      </div>
    </div>
  );
}
