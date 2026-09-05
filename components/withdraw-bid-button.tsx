"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { smallSecondaryButtonClass } from "@/components/ui";
import { submitJson } from "@/lib/forms";

/**
 * Takes back a bid the seller has not answered yet.
 *
 * Withdrawing is final — it does not return the offer to `pending` — but it
 * does free the buyer to bid again, because the index that allows only one
 * live bid per listing counts only pending ones.
 */
export function WithdrawBidButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function withdraw() {
    setError(null);
    startTransition(async () => {
      const result = await submitJson(
        `/api/offers/${offerId}`,
        { status: "withdrawn" },
        "PATCH",
      );

      if (!result.ok) {
        // The seller may have answered in the meantime, in which case the
        // offer is no longer pending and the API says so.
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={withdraw}
        disabled={pending}
        className={`self-start ${smallSecondaryButtonClass}`}
      >
        {pending ? "Withdrawing…" : "Withdraw offer"}
      </button>

      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
