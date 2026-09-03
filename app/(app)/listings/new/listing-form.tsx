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

export function ListingForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const description = String(formData.get("description") ?? "").trim();
    const availableFrom = String(formData.get("availableFrom") ?? "").trim();

    startTransition(async () => {
      const outcome = await submitJson("/api/listings", {
        organizationId,
        title: String(formData.get("title") ?? ""),
        // Numbers come out of a form as strings; the API validates real
        // numbers against the column's precision and scale.
        quantityKg: Number(formData.get("quantityKg") ?? ""),
        pricePerKg: Number(formData.get("pricePerKg") ?? ""),
        status: String(formData.get("status") ?? "draft"),
        ...(description ? { description } : {}),
        ...(availableFrom ? { availableFrom } : {}),
      });

      setResult(outcome);

      if (outcome.ok) {
        router.push(`/?org=${organizationId}`);
        router.refresh();
      }
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

      <Field name="title" label="Title" errors={fieldErrors.title}>
        {(props) => (
          <input
            {...props}
            type="text"
            required
            placeholder="Groundnut K-6, this season's harvest"
            className={controlClassName}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="quantityKg"
          label="Quantity (kg)"
          errors={fieldErrors.quantityKg}
        >
          {(props) => (
            <input
              {...props}
              type="number"
              required
              min={0.01}
              step="0.01"
              inputMode="decimal"
              placeholder="8250"
              className={controlClassName}
            />
          )}
        </Field>

        <Field
          name="pricePerKg"
          label="Price per kg"
          errors={fieldErrors.pricePerKg}
        >
          {(props) => (
            <input
              {...props}
              type="number"
              required
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="62.50"
              className={controlClassName}
            />
          )}
        </Field>
      </div>

      <Field
        name="availableFrom"
        label="Available from"
        hint="Optional. Buyers filtering by collection date see listings from this day onward."
        errors={fieldErrors.availableFrom}
      >
        {(props) => <input {...props} type="date" className={controlClassName} />}
      </Field>

      <Field
        name="description"
        label="Description"
        hint="Optional. Grade, moisture, packaging — whatever a buyer would ask."
        errors={fieldErrors.description}
      >
        {(props) => (
          <textarea {...props} rows={3} className={controlClassName} />
        )}
      </Field>

      <Field
        name="status"
        label="Publish"
        hint="A draft is visible only inside your organization until you publish it."
        errors={fieldErrors.status}
      >
        {(props) => (
          <select {...props} defaultValue="draft" className={controlClassName}>
            <option value="draft">Save as draft</option>
            <option value="active">Publish to the marketplace</option>
          </select>
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Create listing
      </SubmitButton>
    </form>
  );
}
