import Link from "next/link";

import { LoadError, VerifiedBadge, smallSecondaryButtonClass } from "@/components/ui";
import { organizationTypeLabel } from "@/lib/org-types";
import type { ApiResult } from "@/lib/server-api";
import type { OrganizationDTO } from "@/lib/types";

import type { ReactNode } from "react";

/**
 * The identity strip at the top of the dashboard, shared by both sides of the
 * marketplace: who you are acting as, and the switch between the
 * organizations you belong to.
 *
 * What changes between a seller and a buyer is the `actions` slot — listing
 * produce on one side, going shopping on the other — so the branch lives with
 * the caller rather than as a flag threaded through here.
 */
export function DashboardHeader({
  title,
  organizations,
  selectedId,
  role,
  actions,
  unverifiedNotice,
}: {
  title: string;
  organizations: ApiResult<OrganizationDTO[]>;
  selectedId: string;
  role: string | undefined;
  actions: ReactNode;
  /** Shown only where being unverified actually stops something. */
  unverifiedNotice?: ReactNode;
}) {
  const selected = organizations.ok
    ? organizations.data.find((candidate) => candidate.id === selectedId)
    : undefined;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {title}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-ink">
            {selected?.name ?? "Your organization"}
            <VerifiedBadge verifiedAt={selected?.verifiedAt ?? null} />
          </h1>
          <p className="text-sm text-muted">
            {selected ? organizationTypeLabel(selected.organizationType) : null}
            {role ? `${selected ? " · " : ""}you are ${role}` : null}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      {!organizations.ok ? <LoadError message={organizations.error} /> : null}

      {selected && selected.verifiedAt === null ? unverifiedNotice : null}

      {organizations.ok && organizations.data.length > 1 ? (
        <nav
          aria-label="Switch organization"
          className="flex flex-wrap items-center gap-2 border-t border-line pt-3"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Acting as
          </span>
          {organizations.data.map((organization) => {
            const current = organization.id === selectedId;
            return (
              <Link
                key={organization.id}
                href={`/?org=${organization.id}`}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "rounded-md bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand"
                    : "rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
                }
              >
                {organization.name}
              </Link>
            );
          })}
          <Link href="/organizations/new" className={smallSecondaryButtonClass}>
            + New organization
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
