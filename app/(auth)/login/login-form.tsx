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

export function LoginForm() {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Submission is handled here rather than through `<form action>`: React
   * resets an uncontrolled form once an action resolves, which would clear
   * everything the person typed the moment their sign-in was rejected.
   */
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const outcome = await submitJson("/api/auth/login", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });

      setResult(outcome);

      if (outcome.ok) {
        // The session cookie arrived on the response. `refresh()` re-renders
        // the server components with it, so the layout sees the new session
        // instead of bouncing straight back to this page.
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

      <Field name="password" label="Password" errors={fieldErrors.password}>
        {(props) => (
          <input
            {...props}
            type="password"
            autoComplete="current-password"
            required
            className={controlClassName}
          />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
