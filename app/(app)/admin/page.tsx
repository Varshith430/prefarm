import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  Detail,
  EmptyState,
  LoadError,
  SectionHeader,
  VerifiedBadge,
  formatDate,
} from "@/components/ui";
import { VerifyButton } from "@/components/verify-button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getCurrentSession } from "@/lib/auth";
import { apiGet } from "@/lib/server-api";
import type { OrganizationDTO, UserDTO } from "@/lib/types";

export const metadata: Metadata = { title: "Admin · PreFarm" };

type AdminOrganization = OrganizationDTO & {
  members: { role: string; user: Pick<UserDTO, "id" | "fullName" | "email"> }[];
  _count: { members: number; farms: number; listings: number };
};

const tabClassName =
  "rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-ink";
const activeTabClassName =
  "rounded-md bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  // Nothing tells an ordinary user this page exists: it answers exactly as a
  // missing route would. The API refuses them regardless, but a 403 page would
  // itself disclose that platform administration is a thing.
  if (!session.isPlatformAdmin) return notFound();

  const { show } = await searchParams;
  const showVerified = show === "verified";

  const organizations = await apiGet<AdminOrganization[]>(
    `/api/admin/organizations?unverified=${showVerified ? "false" : "true"}&limit=50`,
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Administration" }]}
      />

      <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-bold tracking-tight text-ink">
          Platform administration
        </h1>
        <p className="text-sm text-muted">
          An organization can use everything on the platform before it is
          verified, but cannot publish produce to the marketplace.
        </p>
      </div>

      <nav aria-label="Filter organizations" className="flex flex-wrap gap-2">
        <Link
          href="/admin"
          aria-current={showVerified ? undefined : "page"}
          className={showVerified ? tabClassName : activeTabClassName}
        >
          Awaiting verification
        </Link>
        <Link
          href="/admin?show=verified"
          aria-current={showVerified ? "page" : undefined}
          className={showVerified ? activeTabClassName : tabClassName}
        >
          Verified
        </Link>
      </nav>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={showVerified ? "Verified organizations" : "Waiting the longest first"}
          count={organizations.ok ? organizations.data.length : undefined}
        />

        {!organizations.ok ? (
          <LoadError message={organizations.error} />
        ) : organizations.data.length === 0 ? (
          <EmptyState>
            {showVerified
              ? "No organization has been verified yet."
              : "Nothing is waiting. Newly created organizations appear here."}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {organizations.data.map((organization) => {
              const owner = organization.members[0]?.user;

              return (
                <li key={organization.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                          {organization.name}
                          <VerifiedBadge verifiedAt={organization.verifiedAt} />
                        </p>
                        <p className="text-sm text-muted">
                          {organization.organizationType.replace(/_/g, " ")} ·{" "}
                          {organization.slug}
                        </p>
                      </div>
                      <VerifyButton
                        organizationId={organization.id}
                        verified={organization.verifiedAt !== null}
                      />
                    </div>

                    {organization.description ? (
                      <p className="text-sm">{organization.description}</p>
                    ) : null}

                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Detail
                        label="Owner"
                        value={
                          owner ? (
                            <span title={owner.email}>{owner.fullName}</span>
                          ) : (
                            "No owner on the roster"
                          )
                        }
                      />
                      <Detail label="Members" value={organization._count.members} />
                      <Detail label="Farms" value={organization._count.farms} />
                      <Detail
                        label="Registered"
                        value={formatDate(organization.createdAt)}
                      />
                    </dl>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
