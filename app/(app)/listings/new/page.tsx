import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ListingForm } from "./listing-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getCurrentSession } from "@/lib/auth";
import { sellsProduce } from "@/lib/org-types";

export const metadata: Metadata = { title: "New listing · PreFarm" };

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { org } = await searchParams;

  // The organization comes from the link that led here. Without one — the
  // header's own "Create listing" carries no id — the first organization that
  // sells is used, matching how the dashboard picks which one to open.
  const membership =
    session.memberships.find((candidate) => candidate.organizationId === org) ??
    session.memberships.find((candidate) =>
      sellsProduce(candidate.organizationType),
    );

  // Only the growing side of the market keeps crops and publishes listings.
  // `POST /api/listings` refuses a buyer organization outright; turning them
  // back here means they never reach a form that could not be submitted.
  if (!membership || !sellsProduce(membership.organizationType)) redirect("/");

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Home", href: `/?org=${membership.organizationId}` },
          { label: "My Listings", href: `/?org=${membership.organizationId}` },
          { label: "Create listing" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">
          Create a listing
        </h1>
        <p className="text-sm text-muted">
          A listing stays a draft until you publish it, so nobody sees it
          before you are ready.
        </p>
      </div>

      <div className="max-w-lg rounded-lg border border-line bg-surface p-4">
        <ListingForm organizationId={membership.organizationId} />
      </div>
    </div>
  );
}
