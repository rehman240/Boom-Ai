"use client";

import Link from "next/link";
import { createContext, useContext, useEffect } from "react";

export type Crumb = { label: string; href?: string };

export const BreadcrumbContext = createContext<(crumbs: Crumb[]) => void>(() => {});

/** Pages render <SetBreadcrumbs items={...} /> and the app shell shows them in the top bar. */
export function SetBreadcrumbs({ items }: { items: Crumb[] }) {
  const set = useContext(BreadcrumbContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    set(items);
    // Re-run only when the crumbs actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
  return null;
}

export function BreadcrumbTrail({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-2 truncate text-sm text-subtle">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-2">
              {c.href && !last ? (
                <Link href={c.href} className="truncate hover:text-text">
                  {c.label}
                </Link>
              ) : (
                <span className={`truncate ${last ? "text-muted" : ""}`} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
              {last ? null : <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
