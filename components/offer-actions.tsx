"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  smallPrimaryButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui";
import { submitJson } from "@/lib/forms";

/**
 * The seller's answer to one bid.
 *
 * Only rendered for a pending offer: answering is final, so there is nothing
 * to offer on one that has already been accepted or rejected. The API enforces
 * that regardless of what the page shows.
 */
export function OfferActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function answer(status: "accepted" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await submitJson(`/api/offers/${offerId}`, { status }, "PATCH");

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
        <button
          type="button"
          disabled={pending}
          onClick={() => answer("accepted")}
          className={smallPrimaryButtonClass}
        >
          Accept
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => answer("rejected")}
          className={smallSecondaryButtonClass}
        >
          Reject
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
