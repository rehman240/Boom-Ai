import { useId, type InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Labelled text input with hint and error text wired up for screen readers. */
export function Field({ label, hint, error, required, className = "", ...rest }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-lg font-semibold text-text">
        {label}
        {required ? (
          <span className="ml-1 text-cyan" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={
          "h-16 w-full rounded-xl border bg-bg/60 px-4 text-lg text-text placeholder:text-subtle " +
          "transition-colors focus:outline-none focus-visible:outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/25 " +
          (error ? "border-danger" : "border-border-strong hover:border-[#33529a]")
        }
        {...rest}
      />
      {hint && !error ? (
        <p id={hintId} className="mt-1.5 text-base text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-base text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
