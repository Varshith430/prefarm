import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  Detail,
  EmptyState,
  LoadError,
  SectionHeader,
  VerifiedBadge,
  formatDate,
  formatDecimal,
} from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { apiGet } from "@/lib/server-api";
import type { CropDTO, MarketplaceListingDTO, OrganizationDTO } from "@/lib/types";

export const metadata: Metadata = { title: "Marketplace · AgriTech" };

/** What `GET /api/listings` returns, with the relations that route includes. */
type ListingRow = MarketplaceListingDTO & {
  organization: Pick<
    OrganizationDTO,
    "id" | "name" | "organizationType" | "verifiedAt"
  >;
  cropCycle: { crop: CropDTO } | null;
};

export default async function MarketplacePage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const listings = await apiGet<ListingRow[]>(
    "/api/listings?status=active&limit=50",
  );

  const mine = new Set(session.memberships.map((m) => m.organizationId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Produce currently on offer, cheapest first.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Published listings"
          count={listings.ok ? listings.data.length : undefined}
        />

        {!listings.ok ? (
          <LoadError message={listings.error} />
        ) : listings.data.length === 0 ? (
          <EmptyState>
            Nothing is on the market right now. Published listings from every
            organization appear here.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {listings.data.map((listing) => (
              <li key={listing.id}>
                <Card>
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={`/marketplace/${listing.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {listing.title}
                    </Link>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {listing.organization.name}
                      <VerifiedBadge
                        verifiedAt={listing.organization.verifiedAt}
                      />
                      {mine.has(listing.organization.id) ? (
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          yours
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-3">
                    <Detail
                      label="Price"
                      value={`${formatDecimal(listing.pricePerKg)} / kg`}
                    />
                    <Detail
                      label="Quantity"
                      value={`${formatDecimal(listing.quantityKg)} kg`}
                    />
                    {listing.cropCycle ? (
                      <Detail
                        label="Crop"
                        value={
                          listing.cropCycle.crop.variety
                            ? `${listing.cropCycle.crop.name} · ${listing.cropCycle.crop.variety}`
                            : listing.cropCycle.crop.name
                        }
                      />
                    ) : null}
                    <Detail
                      label="Available from"
                      value={formatDate(listing.availableFrom)}
                    />
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
