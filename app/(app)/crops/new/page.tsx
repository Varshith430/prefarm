import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CropForm } from "./crop-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getCurrentSession } from "@/lib/auth";
import { sellsProduce } from "@/lib/org-types";

export const metadata: Metadata = { title: "New crop · PreFarm" };

export default async function NewCropPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { org } = await searchParams;

  // The organization comes from the dashboard link. It is checked against the
  // session here so the form is never rendered against a tenant the caller
  // cannot write to — the API would refuse the submission anyway, but failing
  // after someone has filled in a form is a poor way to tell them.
  // The organization comes from the link that led here. Without one — the
  // header's own "Create listing" carries no id — the first organization that
  // sells is used, matching how the dashboard picks which one to open.
  const membership =
    session.memberships.find((candidate) => candidate.organizationId === org) ??
    session.memberships.find((candidate) =>
      sellsProduce(candidate.organizationType),
    );

  // Only the growing side of the market keeps crops and publishes listings.
  // `POST /api/crops` refuses a buyer organization outright; turning them
  // back here means they never reach a form that could not be submitted.
  if (!membership || !sellsProduce(membership.organizationType)) redirect("/");

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Home", href: `/?org=${membership.organizationId}` },
          { label: "My Crops", href: `/?org=${membership.organizationId}` },
          { label: "Add new crop" },
        ]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">
          Add a new crop
        </h1>
        <p className="text-sm text-muted">
          Crops are the varieties you grow. Once added, they can be planted
          into fields and listed for sale.
        </p>
      </div>

      <div className="max-w-md rounded-lg border border-line bg-surface p-4">
        <CropForm organizationId={membership.organizationId} />
      </div>
    </div>
  );
}
