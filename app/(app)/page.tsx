import type { Metadata } from "next";
import Link from "next/link";

import { ListingActions } from "@/components/listing-actions";
import {
  Card,
  Detail,
  EmptyState,
  LoadError,
  SectionHeader,
  StatusBadge,
  formatDate,
  formatDecimal,
} from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { apiGet } from "@/lib/server-api";
import type {
  CropDTO,
  MarketplaceListingDTO,
  OrganizationDTO,
} from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard · AgriTech" };

const linkClassName =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

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

  const roleFor = new Map(
    session.memberships.map((m) => [m.organizationId, m.role]),
  );

  // Which organization to show is decided from the session alone. A stale or
  // hand-typed `?org=` is ignored rather than sent to the API, which would
  // answer 403 and blank the page; falling back to the first organization
  // keeps the dashboard usable. Deciding here rather than after fetching the
  // organization list is what lets all three requests go out at once.
  const selectedId =
    session.memberships.find((m) => m.organizationId === requestedOrg)
      ?.organizationId ?? session.memberships[0]?.organizationId;

  if (!selectedId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <EmptyState>
          You do not belong to an organization yet. Ask an owner to add you to
          theirs, and their crops and listings will appear here.
        </EmptyState>
      </div>
    );
  }

  // Nothing here depends on anything else, so the three requests go out
  // together; in series this page would wait out three round trips instead of
  // one.
  const [organizations, crops, listings] = await Promise.all([
    apiGet<OrganizationDTO[]>("/api/organizations?limit=50"),
    apiGet<CropDTO[]>(
      `/api/crops?organizationId=${selectedId}&includeShared=false&limit=50`,
    ),
    apiGet<MarketplaceListingDTO[]>(
      `/api/listings?organizationId=${selectedId}&limit=50`,
    ),
  ]);

  // The organization list supplies display names only. If that one call fails
  // the crops and listings panels are still worth showing, so the header
  // degrades instead of the page.
  const selected = organizations.ok
    ? organizations.data.find((candidate) => candidate.id === selectedId)
    : undefined;

  const role = roleFor.get(selectedId);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {selected?.name ?? "Your organization"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {selected ? selected.organizationType.replace(/_/g, " ") : null}
            {role ? `${selected ? " · " : ""}you are ${role}` : null}
          </p>
        </div>

        {!organizations.ok ? <LoadError message={organizations.error} /> : null}

        {organizations.ok && organizations.data.length > 1 ? (
          <nav
            aria-label="Switch organization"
            className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800"
          >
            {organizations.data.map((organization) => {
              const current = organization.id === selectedId;
              return (
                <Link
                  key={organization.id}
                  href={`/?org=${organization.id}`}
                  aria-current={current ? "page" : undefined}
                  className={
                    current
                      ? "rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : linkClassName
                  }
                >
                  {organization.name}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Crops"
          count={crops.ok ? crops.data.length : undefined}
          action={
            <Link href={`/crops/new?org=${selectedId}`} className={linkClassName}>
              New crop
            </Link>
          }
        />

        {!crops.ok ? (
          <LoadError message={crops.error} />
        ) : crops.data.length === 0 ? (
          <EmptyState>
            No crops yet. Add the varieties you grow so they can be planted into
            fields and listed for sale.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {crops.data.map((crop) => (
              <li key={crop.id}>
                <Card>
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium">{crop.name}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {crop.variety ?? "No variety recorded"}
                    </p>
                  </div>
                  <dl>
                    <Detail
                      label="Typical time to harvest"
                      value={
                        crop.typicalDaysToHarvest
                          ? `${crop.typicalDaysToHarvest} days`
                          : "—"
                      }
                    />
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Listings"
          count={listings.ok ? listings.data.length : undefined}
          action={
            <Link
              href={`/listings/new?org=${selectedId}`}
              className={linkClassName}
            >
              New listing
            </Link>
          }
        />

        {!listings.ok ? (
          <LoadError message={listings.error} />
        ) : listings.data.length === 0 ? (
          <EmptyState>
            Nothing listed for sale. A listing stays a draft until you publish
            it, so nobody sees it before you are ready.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {listings.data.map((listing) => (
              <li key={listing.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <p className="font-medium">{listing.title}</p>
                      {listing.description ? (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          {listing.description}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={listing.status} />
                  </div>

                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Detail
                      label="Quantity"
                      value={`${formatDecimal(listing.quantityKg)} kg`}
                    />
                    <Detail
                      label="Price"
                      value={`${formatDecimal(listing.pricePerKg)} / kg`}
                    />
                    <Detail
                      label="Available from"
                      value={formatDate(listing.availableFrom)}
                    />
                  </dl>

                  <ListingActions listingId={listing.id} status={listing.status} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
