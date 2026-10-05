"use client";

import { useId, useState } from "react";
import { Briefcase, Building2, Check, Cpu, FlaskConical, type LucideIcon } from "lucide-react";
import { AI_ENGINES, CAMPAIGN_TYPES, engineLabel, type AiEngine, type CampaignType } from "@/lib/brief";

const TYPE_ICONS: Record<CampaignType, LucideIcon> = {
  own_business: Briefcase,
  client: Building2,
  research: FlaskConical,
};

const legendClass = "mb-3 block text-base font-semibold text-text";

/**
 * "Is this campaign…" as three large radio cards. Real radio inputs named "campaign_type", so the
 * keyboard works as usual and the brief guide can jump to the group.
 */
export function CampaignTypePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: CampaignType | "";
  onChange: (next: CampaignType) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className={legendClass}>
        Is this campaign…
        <span className="ml-1 text-cyan" aria-hidden="true">
          *
        </span>
      </legend>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-3"}`}>
        {CAMPAIGN_TYPES.map((type) => {
          const Icon = TYPE_ICONS[type.value];
          const on = value === type.value;
          return (
            <label
              key={type.value}
              htmlFor={`${id}-${type.value}`}
              className={
                "relative flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 sm:flex-col sm:items-start transition-colors has-focus-visible:outline-2 has-focus-visible:outline-cyan " +
                (on ? "border-cyan bg-primary/15" : "border-border-strong hover:border-[#33529a]")
              }
            >
              <input
                id={`${id}-${type.value}`}
                type="radio"
                name="campaign_type"
                value={type.value}
                checked={on}
                onChange={() => onChange(type.value)}
                className="sr-only"
              />
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? "bg-cyan text-bg" : "bg-surface-3 text-muted"}`}
              >
                {on ? <Check className="h-6 w-6" aria-hidden="true" /> : <Icon className="h-6 w-6" aria-hidden="true" />}
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-semibold text-text">{type.label}</span>
                <span className="mt-0.5 block text-sm text-muted">{type.detail}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The AI engine for this campaign. Claude is the only live engine; the others are real
 * buttons that say they are coming soon, so the choice itself is always visible.
 */
export function EnginePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: AiEngine;
  onChange: (next: AiEngine) => void;
  disabled?: boolean;
}) {
  const [soon, setSoon] = useState("");
  return (
    <fieldset disabled={disabled}>
      <legend className={legendClass}>AI engine for this campaign</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {AI_ENGINES.map((engine) => {
          const on = engine.live && value === engine.value;
          return (
            <button
              key={engine.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (engine.live) {
                  setSoon("");
                  onChange(engine.value);
                } else {
                  setSoon(`${engine.label} is coming soon. This campaign uses ${engineLabel(value)} for now.`);
                }
              }}
              className={
                "flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors sm:flex-col sm:items-start " +
                (on
                  ? "border-cyan bg-primary/15"
                  : engine.live
                    ? "border-border-strong hover:border-[#33529a]"
                    : "border-dashed border-border-strong opacity-80 hover:opacity-100")
              }
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? "bg-cyan text-bg" : "bg-surface-3 text-muted"}`}
              >
                {on ? <Check className="h-6 w-6" aria-hidden="true" /> : <Cpu className="h-6 w-6" aria-hidden="true" />}
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-semibold text-text">{engine.label}</span>
                <span className="mt-0.5 block text-sm text-muted">{engine.live ? engine.maker : "Coming soon"}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-6 text-sm text-warning" role="status">
        {soon}
      </p>
    </fieldset>
  );
}

/** Always-visible reminder of which engine this campaign runs on. */
export function EngineBadge({ engine }: { engine: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-primary/15 px-4 py-2 text-base font-semibold text-cyan">
      <Cpu className="h-5 w-5" aria-hidden="true" />
      AI engine: {engineLabel(engine)}
    </span>
  );
}
