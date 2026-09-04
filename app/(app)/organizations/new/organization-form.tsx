"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { OrganizationType } from "@/app/generated/prisma/enums";
import {
  Field,
  FormError,
  SubmitButton,
  controlClassName,
} from "@/components/form";
import { fieldErrorsOf, submitJson } from "@/lib/forms";
import type { ActionResult, OrganizationDTO } from "@/lib/types";

/** "input_supplier" -> "Input supplier". */
function humanize(value: string): string {
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ORGANIZATION_TYPES = Object.values(OrganizationType);

export function OrganizationForm() {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const description = String(formData.get("description") ?? "").trim();

    startTransition(async () => {
      const outcome = await submitJson<OrganizationDTO>("/api/organizations", {
        name: String(formData.get("name") ?? ""),
        organizationType: String(formData.get("organizationType") ?? "farm"),
        ...(description ? { description } : {}),
      });

      setResult(outcome);

      if (outcome.ok) {
        // Creating an organization makes you its owner, so the dashboard can
        // open straight onto it.
        router.push(`/?org=${outcome.data.id}`);
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

      <Field
        name="name"
        label="Name"
        // The slug is derived from the name and never typed here, so a
        // complaint about it belongs on the field the caller can actually fix.
        errors={fieldErrors.name ?? fieldErrors.slug}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            required
            autoComplete="organization"
            placeholder="Green Valley Farms"
            className={controlClassName}
          />
        )}
      </Field>

      <Field name="organizationType" label="Type" errors={fieldErrors.organizationType}>
        {(props) => (
          <select {...props} defaultValue="farm" className={controlClassName}>
            {ORGANIZATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanize(type)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        name="description"
        label="Description"
        hint="Optional. What you grow, buy, or provide."
        errors={fieldErrors.description}
      >
        {(props) => <textarea {...props} rows={3} className={controlClassName} />}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Creating…">
        Create organization
      </SubmitButton>
    </form>
  );
}
