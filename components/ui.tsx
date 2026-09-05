import type { ReactNode } from "react";

/**
 * Small presentational pieces shared by every page. Server-safe: no hooks, no
 * event handlers, so they can render inside Server Components.
 *
 * Colours come from the tokens in globals.css rather than a palette scale, so
 * light and dark are decided once there instead of on every element here.
 */

/** A white panel on the grey page — the unit shopping sites build out of. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/** Button styling, shared so every action on the site matches. */
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm " +
  "font-semibold text-white shadow-sm transition hover:bg-brand-strong " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** The "buy" button: the one orange control on a page, as shoppers expect. */
export const accentButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm " +
  "font-semibold text-white shadow-sm transition hover:bg-accent-strong " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-surface " +
  "px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** The compact variant used inside cards, where a full-size button would shout. */
export const smallPrimaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs " +
  "font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60";

export const smallSecondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-surface " +
  "px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60";

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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-baseline gap-2 text-base font-semibold tracking-tight text-ink">
        {title}
        {count !== undefined ? (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
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
    <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
      {children}
    </p>
  );
}

/**
 * Shown when a section's API call failed. Each section renders its own, so one
 * failing request degrades that panel instead of blanking the page.
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

/** Tones for both listing statuses and offer statuses. */
const LISTING_TONES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  sold: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  rejected: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
  withdrawn: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    LISTING_TONES[status] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/**
 * Marks an organization a platform administrator has checked. Rendered only
 * when verification has actually been granted — an absent badge is what
 * "unverified" looks like, rather than a second, louder badge.
 */
export function VerifiedBadge({ verifiedAt }: { verifiedAt: string | null }) {
  if (!verifiedAt) return null;

  return (
    <span
      title={`Verified on ${formatDate(verifiedAt)}`}
      className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.7-9.8a1 1 0 0 0-1.4-1.4L7 8.1 5.7 6.8a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0Z"
        />
      </svg>
      Verified
    </span>
  );
}

/** A labelled value inside a card. */
export function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

/**
 * A price, in the shape a shopper scans for: the figure large and in the
 * accent colour, the unit it is charged per kept small beside it.
 *
 * No currency symbol is shown because the platform stores none — prices are
 * plain decimals per kilogram, and inventing a currency here would state
 * something the data does not.
 */
export function Price({
  value,
  unit = "kg",
  size = "md",
}: {
  value: string;
  unit?: string;
  size?: "sm" | "md" | "lg";
}) {
  const figure =
    size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base";

  return (
    <p className="flex items-baseline gap-1">
      <span className={`${figure} font-bold tracking-tight text-accent`}>
        {formatDecimal(value)}
      </span>
      <span className="text-xs font-medium text-muted">/ {unit}</span>
    </p>
  );
}

/** One figure in the row of counts across the top of the dashboard. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
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
