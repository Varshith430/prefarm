"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  smallPrimaryButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui";
import { submitJson } from "@/lib/forms";

/**
 * Grants or revokes an organization's verification.
 *
 * The timestamp is sent by the client rather than assumed by the server so
 * that the column means "verified at this moment" for a grant and nothing at
 * all for a revocation, with one endpoint covering both.
 */
export function VerifyButton({
  organizationId,
  verified,
}: {
  organizationId: string;
  verified: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(verifiedAt: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await submitJson(
        `/api/admin/organizations/${organizationId}`,
        { verifiedAt },
        "PATCH",
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // The organization leaves (or joins) the pending queue, so the list has
      // to be re-fetched rather than patched in place.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {verified ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => set(null)}
          className={`self-start ${smallSecondaryButtonClass}`}
        >
          {pending ? "Working…" : "Revoke verification"}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => set(new Date().toISOString())}
          className={`self-start ${smallPrimaryButtonClass}`}
        >
          {pending ? "Verifying…" : "Verify"}
        </button>
      )}

      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
