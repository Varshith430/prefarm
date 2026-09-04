"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  Field,
  FormError,
  SubmitButton,
  controlClassName,
} from "@/components/form";
import { fieldErrorsOf, submitJson } from "@/lib/forms";
import type { ActionResult } from "@/lib/types";

/**
 * Places a bid on a listing.
 *
 * Price and quantity start at the seller's asking figures, which is the offer
 * a buyer is accepting outright — anything else is an edit away, and it saves
 * retyping the numbers just to agree with them.
 */
export function BidForm({
  listingId,
  organizationId,
  askingPrice,
  availableQuantity,
}: {
  listingId: string;
  organizationId: string;
  askingPrice: string;
  availableQuantity: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const outcome = await submitJson("/api/offers", {
        listingId,
        organizationId,
        pricePerUnit: Number(formData.get("pricePerUnit") ?? ""),
        quantity: Number(formData.get("quantity") ?? ""),
      });

      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  const fieldErrors = fieldErrorsOf(result);
  const formError =
    result && !result.ok && Object.keys(fieldErrors).length === 0
      ? result.error
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="pricePerUnit"
          label="Your price per kg"
          errors={fieldErrors.pricePerUnit}
        >
          {(props) => (
            <input
              {...props}
              type="number"
              required
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={askingPrice}
              className={controlClassName}
            />
          )}
        </Field>

        <Field name="quantity" label="Quantity (kg)" errors={fieldErrors.quantity}>
          {(props) => (
            <input
              {...props}
              type="number"
              required
              min={0.01}
              step="0.01"
              inputMode="decimal"
              defaultValue={availableQuantity}
              className={controlClassName}
            />
          )}
        </Field>
      </div>

      <SubmitButton pending={pending} pendingLabel="Sending…">
        Place bid
      </SubmitButton>
    </form>
  );
}
