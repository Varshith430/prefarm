import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CropForm } from "./crop-form";
import { getCurrentSession } from "@/lib/auth";

export const metadata: Metadata = { title: "New crop · AgriTech" };

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
  const membership =
    session.memberships.find((candidate) => candidate.organizationId === org) ??
    (session.memberships.length === 1 ? session.memberships[0] : undefined);

  if (!membership) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/?org=${membership.organizationId}`}
          className="text-sm text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
        >
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New crop</h1>
      </div>

      <div className="max-w-md">
        <CropForm organizationId={membership.organizationId} />
      </div>
    </div>
  );
}
