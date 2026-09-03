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

export function CropForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const variety = String(formData.get("variety") ?? "").trim();
    const days = String(formData.get("typicalDaysToHarvest") ?? "").trim();

    startTransition(async () => {
      const outcome = await submitJson("/api/crops", {
        // Sent explicitly so the crop lands in the organization the dashboard
        // is showing; the API still checks it against the caller's
        // memberships, so this selects among their own and nothing more.
        organizationId,
        name: String(formData.get("name") ?? ""),
        ...(variety ? { variety } : {}),
        // An empty number input submits "", which is not a number; omitting
        // the key lets the column stay null instead of failing validation.
        ...(days ? { typicalDaysToHarvest: Number(days) } : {}),
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

      <Field name="name" label="Crop" errors={fieldErrors.name}>
        {(props) => (
          <input
            {...props}
            type="text"
            required
            placeholder="Groundnut"
            className={controlClassName}
          />
        )}
      </Field>

      <Field
        name="variety"
        label="Variety"
        hint="Optional, but two crops with the same name and no variety cannot be told apart."
        errors={fieldErrors.variety}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            placeholder="K-6"
            className={controlClassName}
          />
        )}
      </Field>

      <Field
        name="typicalDaysToHarvest"
        label="Typical days to harvest"
        hint="Optional. Used to suggest a harvest date when this crop is planted."
        errors={fieldErrors.typicalDaysToHarvest}
      >
        {(props) => (
          <input
            {...props}
            type="number"
            min={1}
            max={2000}
            inputMode="numeric"
            placeholder="110"
            className={controlClassName}
          />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Add crop
      </SubmitButton>
    </form>
  );
}
