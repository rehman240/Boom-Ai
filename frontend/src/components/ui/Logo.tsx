import { BRAND, PRODUCT } from "@/lib/brand";

/** Simple text wordmark for the product UI (the detailed logo art is only for marketing). */
export function Logo({ withProduct = false, className = "" }: { withProduct?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-display text-xl font-bold tracking-[0.08em] text-text">{BRAND}</span>
      {withProduct && PRODUCT ? (
        <span className="font-display text-sm font-semibold uppercase tracking-widest text-cyan">{PRODUCT}</span>
      ) : null}
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-red" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" />
      </span>
    </span>
  );
}
