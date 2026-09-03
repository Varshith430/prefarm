import type { ReactNode } from "react";

/**
 * Small presentational pieces shared by the dashboard pages. Server-safe: no
 * hooks, no event handlers, so they can render inside Server Components.
 */

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="flex items-baseline gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {title}
        {count !== undefined ? (
          <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

/** Shown where a list would be, when there is nothing in it yet. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </p>
  );
}

/**
 * Shown when a section's API call failed. Each section renders its own, so one
 * failing request degrades that panel instead of blanking the dashboard.
 */
export function LoadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {message}
    </p>
  );
}

const LISTING_TONES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  sold: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    LISTING_TONES[status] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/** A labelled value inside a card. */
export function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/**
 * Formats a decimal that arrived as a string. Decimals cross the wire as exact
 * strings, so they are parsed for display only — never for arithmetic.
 */
export function formatDecimal(value: string, fractionDigits = 2): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      })
    : value;
}

/** Formats an ISO date for display, keeping it stable between server and client. */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
