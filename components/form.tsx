"use client";

import type { ReactNode } from "react";

import { primaryButtonClass } from "@/components/ui";

/**
 * Form primitives that render the `ActionResult` envelope.
 *
 * `error` is the form-level message; `fieldErrors` maps input names to the
 * messages belonging under each one. Both are wired to the accessibility
 * attributes a screen reader needs — `aria-invalid` on the control and
 * `aria-describedby` pointing at the message — because an error nobody is told
 * about is not handled.
 */

/** The banner above a form: a failure that belongs to no single input. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </p>
  );
}

/** The messages under one input. */
export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors || errors.length === 0) return null;

  return (
    <p id={id} className="text-sm text-red-700 dark:text-red-300">
      {errors.join(" ")}
    </p>
  );
}

interface FieldProps {
  name: string;
  label: string;
  /** Guidance shown before anything goes wrong, e.g. a length requirement. */
  hint?: string;
  errors?: string[];
  /**
   * Receives the wiring for the control: its id, and the aria attributes that
   * tie it to the hint and error below. Taking a function rather than plain
   * children keeps a `<select>` as easy to wire up correctly as an `<input>`.
   */
  children: (props: {
    id: string;
    name: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
}

export function Field({ name, label, hint, errors, children }: FieldProps) {
  const invalid = Boolean(errors && errors.length > 0);
  const hintId = hint ? `${name}-hint` : null;
  const errorId = invalid ? `${name}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>

      {children({
        id: name,
        name,
        ...(invalid ? { "aria-invalid": true as const } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}

      {hint ? (
        <p id={hintId ?? undefined} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}

      <FieldError id={errorId ?? `${name}-error`} errors={errors} />
    </div>
  );
}

/** Shared input styling, so every control on every form matches. */
export const controlClassName =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 " +
  "focus:ring-brand/30 aria-[invalid]:border-red-500 aria-[invalid]:ring-red-200 " +
  "dark:aria-[invalid]:ring-red-900";

export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={primaryButtonClass}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
