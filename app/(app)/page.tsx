import type { Metadata } from "next";
import Link from "next/link";

import { BuyerDashboard } from "./dashboard-buyer";
import { SellerDashboard } from "./dashboard-seller";
import { EmptyState } from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { sellsProduce } from "@/lib/org-types";

export const metadata: Metadata = { title: "Dashboard · PreFarm" };

/**
 * The dashboard, which is two different pages depending on which side of the
 * marketplace the selected organization is on.
 *
 * A farm sees what it has for sale; a buyer sees what it has offered for. The
 * choice is made from `organizations.organization_type`, which travels on the
 * session, so it is settled before any data is fetched — a buyer's dashboard
 * never asks for crops or listings at all, and the branch still holds if the
 * organization list fails to load.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  // The layout has already redirected anyone without a session; this reads it
  // again because a layout cannot pass values down to the page it wraps.
  const session = await getCurrentSession();
  if (!session) return null;

  const { org: requestedOrg } = await searchParams;

  // Which organization to show is decided from the session alone. A stale or
  // hand-typed `?org=` is ignored rather than sent to the API, which would
  // answer 403 and blank the page; falling back to the first organization
  // keeps the dashboard usable.
  const membership =
    session.memberships.find((m) => m.organizationId === requestedOrg) ??
    session.memberships[0];

  if (!membership) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold tracking-tight text-ink">Dashboard</h1>
        <EmptyState>
          You do not belong to an organization yet. Ask an owner to add you to
          theirs, or{" "}
          <Link
            href="/organizations/new"
            className="font-semibold text-brand hover:underline"
          >
            create your own
          </Link>
          .
        </EmptyState>
      </div>
    );
  }

  return sellsProduce(membership.organizationType) ? (
    <SellerDashboard
      selectedId={membership.organizationId}
      role={membership.role}
    />
  ) : (
    <BuyerDashboard
      selectedId={membership.organizationId}
      role={membership.role}
    />
  );
}
