"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitJson } from "@/lib/forms";

/**
 * Status transitions on a listing card.
 *
 * Publishing, marking sold, and archiving are all `PATCH { status }` on the
 * listing, so they live together here rather than in three endpoints. Which
 * ones are offered depends on where the listing currently is; a listing that
 * has been archived is finished and offers none.
 */
const TRANSITIONS: Record<string, { label: string; next: string; quiet?: boolean }[]> = {
  draft: [
    { label: "Publish", next: "active" },
    { label: "Archive", next: "archived", quiet: true },
  ],
  active: [
    { label: "Mark sold", next: "sold" },
    { label: "Archive", next: "archived", quiet: true },
  ],
  sold: [{ label: "Archive", next: "archived", quiet: true }],
  archived: [],
};

export function ListingActions({
  listingId,
  status,
}: {
  listingId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const available = TRANSITIONS[status] ?? [];
  if (available.length === 0) return null;

  function change(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await submitJson(
        `/api/listings/${listingId}`,
        { status: next },
        "PATCH",
      );

      // A viewer may see the buttons and still be refused by the API, which is
      // the honest place for that check to happen — so the refusal is shown
      // rather than swallowed.
      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {available.map((transition) => (
          <button
            key={transition.next}
            type="button"
            disabled={pending}
            onClick={() => change(transition.next)}
            className={
              transition.quiet
                ? "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                : "rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            }
          >
            {transition.label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
