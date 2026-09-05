import type { Metadata } from "next";

import { OrganizationForm } from "./organization-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getCurrentSession } from "@/lib/auth";

export const metadata: Metadata = { title: "New organization · PreFarm" };

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
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          ...(hasOrganizations ? [{ label: "Home", href: "/" }] : []),
          { label: "New organization" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">
          New organization
        </h1>
        <p className="text-sm text-muted">
          You will be its owner, and can add colleagues afterwards.
        </p>
      </div>

      <div className="max-w-md rounded-lg border border-line bg-surface p-4">
        <OrganizationForm />
      </div>
    </div>
  );
}
