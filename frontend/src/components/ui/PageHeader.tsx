import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-3">{actions}</div> : null}
    </header>
  );
}
