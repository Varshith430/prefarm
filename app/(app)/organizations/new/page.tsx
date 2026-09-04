import type { Metadata } from "next";
import Link from "next/link";

import { OrganizationForm } from "./organization-form";
import { getCurrentSession } from "@/lib/auth";

export const metadata: Metadata = { title: "New organization · AgriTech" };

/**
 * Anyone signed in may create an organization and becomes its owner. This is
 * the way out of the dead end left by signing up without naming one: the API
 * has always allowed it, but until now nothing in the app asked for it.
 */
export default async function NewOrganizationPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const hasOrganizations = session.memberships.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {hasOrganizations ? (
          <Link
            href="/"
            className="text-sm text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
          >
            Back to dashboard
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">
          New organization
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You will be its owner, and can add colleagues afterwards.
        </p>
      </div>

      <div className="max-w-md">
        <OrganizationForm />
      </div>
    </div>
  );
}
