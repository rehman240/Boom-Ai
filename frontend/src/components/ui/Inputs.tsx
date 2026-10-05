"use client";

import { useId, useState, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

const labelClass = "mb-2 block text-lg font-semibold text-text";

const controlClass = (error?: string) =>
  "w-full rounded-xl border bg-bg/60 px-4 text-lg text-text placeholder:text-subtle " +
  "transition-colors focus:outline-none focus-visible:outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/25 " +
  (error ? "border-danger" : "border-border-strong hover:border-[#33529a]");

function Shell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required ? (
          <span className="ml-1 text-cyan" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-base text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-base text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Textarea({ label, hint, error, required, rows = 3, ...rest }: TextareaProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null]
          .filter(Boolean)
          .join(" ") || undefined}
        className={`${controlClass(error)} resize-y py-3 leading-relaxed`}
        {...rest}
      />
    </Shell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  options: readonly string[];
};

export function Select({ label, hint, error, required, options, placeholder, ...rest }: SelectProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined}
          className={`${controlClass(error)} h-16 appearance-none pr-10`}
          {...rest}
        >
          <option value="">{placeholder ?? "Choose one"}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
      </div>
    </Shell>
  );
}

/**
 * Multi-select as toggle chips, like the brand voice row in the reference screens.
 * `comingSoon` options are shown in the row but only say so when pressed.
 */
export function ChipGroup({
  label,
  hint,
  options,
  comingSoon = [],
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  comingSoon?: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [soon, setSoon] = useState("");
  const toggle = (option: string) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);

  return (
    <fieldset>
      <legend className={labelClass}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={on}
              className={
                "min-h-12 rounded-full border px-5 py-2 text-base font-semibold transition-colors " +
                (on
                  ? "border-primary bg-primary/20 text-cyan"
                  : "border-border-strong text-muted hover:border-[#33529a] hover:text-text")
              }
            >
              {option}
            </button>
          );
        })}
        {comingSoon.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSoon(`${option} is coming soon.`)}
            className="min-h-12 rounded-full border border-dashed border-cyan/60 px-5 py-2 text-base font-semibold text-cyan transition-colors hover:bg-primary/15"
          >
            {option} <span className="ml-1 text-sm font-medium text-muted">Coming soon</span>
          </button>
        ))}
      </div>
      {comingSoon.length ? (
        <p className="mt-2 min-h-6 text-sm text-warning" role="status">
          {soon}
        </p>
      ) : null}
      {hint ? <p className="mt-2 text-base text-muted">{hint}</p> : null}
    </fieldset>
  );
}
