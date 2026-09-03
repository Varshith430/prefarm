"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { submitJson } from "@/lib/forms";

/**
 * Signs out and returns to the sign-in page.
 *
 * A button rather than a link: signing out changes server state, and a GET
 * that ends a session can be triggered by anything that prefetches a URL.
 * Logout answers 204 whether or not there was a session, so there is no
 * failure case to show the user here — the redirect is the confirmation.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      await submitJson("/api/auth/logout");
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
