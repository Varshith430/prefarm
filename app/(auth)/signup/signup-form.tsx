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
import type { ActionResult } from "@/lib/types";

/** "input_supplier" -> "Input supplier", for the organization type menu. */
function humanize(value: string): string {
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ORGANIZATION_TYPES = Object.values(OrganizationType);

export function SignUpForm() {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Submission is handled here rather than through `<form action>`: React
   * resets an uncontrolled form once an action resolves, which would empty
   * every field the moment one of them failed validation — leaving someone
   * who mistyped a password to retype their name, email, and organization.
   */
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const organizationName = String(formData.get("organizationName") ?? "").trim();

    startTransition(async () => {
      const outcome = await submitJson("/api/auth/register", {
        email: String(formData.get("email") ?? ""),
        fullName: String(formData.get("fullName") ?? ""),
        password: String(formData.get("password") ?? ""),
        // The organization is optional: leaving the name blank creates the
        // account on its own, for someone who will be invited into an existing
        // organization rather than starting their own.
        ...(organizationName
          ? {
              organization: {
                name: organizationName,
                organizationType: String(formData.get("organizationType") ?? "farm"),
              },
            }
          : {}),
      });

      setResult(outcome);

      if (outcome.ok) {
        // Registering signs you in, so the session cookie is already set.
        router.replace("/");
        router.refresh();
      }
    });
  }

  const fieldErrors = fieldErrorsOf(result);

  // The banner carries failures that belong to no single input — a wrong
  // password, a server that could not be reached. When the inputs are already
  // marked individually, a generic "Validation failed." above them only adds
  // noise, so it is dropped in favour of the specific messages.
  const formError =
    result && !result.ok && Object.keys(fieldErrors).length === 0
      ? result.error
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />

      <Field name="fullName" label="Your name" errors={fieldErrors.fullName}>
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="name"
            required
            className={controlClassName}
          />
        )}
      </Field>

      <Field name="email" label="Email" errors={fieldErrors.email}>
        {(props) => (
          <input
            {...props}
            type="email"
            autoComplete="email"
            required
            className={controlClassName}
          />
        )}
      </Field>

      <Field
        name="password"
        label="Password"
        hint="At least 10 characters. A short phrase works well."
        errors={fieldErrors.password}
      >
        {(props) => (
          <input
            {...props}
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className={controlClassName}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm font-medium">
          Your organization{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            (optional)
          </span>
        </legend>

        <Field
          name="organizationName"
          label="Name"
          hint="Leave blank if someone will add you to an existing organization."
          // A validation failure inside the nested `organization` object is
          // flattened onto that key, so both are shown here.
          errors={fieldErrors.organizationName ?? fieldErrors.organization}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="organization"
              className={controlClassName}
            />
          )}
        </Field>

        <Field name="organizationType" label="Type">
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
      </fieldset>

      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
