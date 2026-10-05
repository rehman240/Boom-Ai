"use client";

import { useId, useState } from "react";
import { Briefcase, Building2, Check, Cpu, FlaskConical, type LucideIcon } from "lucide-react";
import { AI_ENGINES, USER_ROLES, engineLabel, type AiEngine, type UserRole } from "@/lib/brief";

const ROLE_ICONS: Record<UserRole, LucideIcon> = {
  business_owner: Briefcase,
  agency: Building2,
  research: FlaskConical,
};

const legendClass = "mb-3 block text-base font-semibold text-text";

/**
 * "Who are you?" as three large radio cards. Real radio inputs named "user_role", so the
 * keyboard works as usual and the brief guide can jump to the group.
 */
export function RolePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: UserRole | "";
  onChange: (next: UserRole) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className={legendClass}>
        Who are you?
        <span className="ml-1 text-cyan" aria-hidden="true">
          *
        </span>
      </legend>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-3"}`}>
        {USER_ROLES.map((role) => {
          const Icon = ROLE_ICONS[role.value];
          const on = value === role.value;
          return (
            <label
              key={role.value}
              htmlFor={`${id}-${role.value}`}
              className={
                "relative flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 sm:flex-col sm:items-start transition-colors has-focus-visible:outline-2 has-focus-visible:outline-cyan " +
                (on ? "border-cyan bg-primary/15" : "border-border-strong hover:border-[#33529a]")
              }
            >
              <input
                id={`${id}-${role.value}`}
                type="radio"
                name="user_role"
                value={role.value}
                checked={on}
                onChange={() => onChange(role.value)}
                className="sr-only"
              />
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? "bg-cyan text-bg" : "bg-surface-3 text-muted"}`}
              >
                {on ? <Check className="h-6 w-6" aria-hidden="true" /> : <Icon className="h-6 w-6" aria-hidden="true" />}
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-semibold text-text">{role.label}</span>
                <span className="mt-0.5 block text-sm text-muted">{role.detail}</span>
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
