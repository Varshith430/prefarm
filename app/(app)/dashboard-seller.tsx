import Link from "next/link";

import { DashboardHeader } from "./dashboard-header";
import { CropVisual } from "@/components/crop-visual";
import { ListingActions } from "@/components/listing-actions";
import { OfferActions } from "@/components/offer-actions";
import {
  Card,
  Detail,
  EmptyState,
  LoadError,
  Price,
  SectionHeader,
  StatTile,
  StatusBadge,
  formatDate,
  formatDecimal,
  primaryButtonClass,
  secondaryButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui";
import { apiGet } from "@/lib/server-api";
import type {
  CropDTO,
  MarketplaceListingDTO,
  OfferDTO,
  OrganizationDTO,
  UserDTO,
} from "@/lib/types";

/** A listing of the seller's own, with the harvest it came from. */
type ListingRow = MarketplaceListingDTO & {
  cropCycle: { crop: Pick<CropDTO, "name" | "variety"> } | null;
};

/** An offer, from the side of the organization being offered to. */
type OfferRow = OfferDTO & {
  buyerOrganization: Pick<OrganizationDTO, "id" | "name" | "organizationType">;
  buyer: Pick<UserDTO, "id" | "fullName" | "email"> | null;
  listing: Pick<
    MarketplaceListingDTO,
    "id" | "title" | "organizationId" | "status"
  >;
};

/**
 * The dashboard for an organization that grows and sells: what it has listed,
 * what it grows, and who has offered for it.
 */
export async function SellerDashboard({
  selectedId,
  role,
}: {
  selectedId: string;
  role: string | undefined;
}) {
  // Nothing here depends on anything else, so the requests go out together; in
  // series this page would wait out four round trips instead of one.
  const [organizations, crops, listings, offers] = await Promise.all([
    apiGet<OrganizationDTO[]>("/api/organizations?limit=50"),
    apiGet<CropDTO[]>(
      `/api/crops?organizationId=${selectedId}&includeShared=false&limit=50`,
    ),
    apiGet<ListingRow[]>(`/api/listings?organizationId=${selectedId}&limit=50`),
    // The offers endpoint answers with both sides of the market — offers this
    // organization has placed as well as offers placed on it — so the selling
    // side is picked out below.
    apiGet<OfferRow[]>("/api/offers?limit=100"),
  ]);

  const selected = organizations.ok
    ? organizations.data.find((candidate) => candidate.id === selectedId)
    : undefined;

  // A missing organization list must not take the "Create listing" button with
  // it, so an unknown verification state is treated as verified: the API
  // refuses the write anyway if it is not.
  const verified = selected ? selected.verifiedAt !== null : true;

  const received = offers.ok
    ? offers.data.filter((offer) => offer.listing.organizationId === selectedId)
    : [];
  const pendingOffers = received.filter((offer) => offer.status === "pending");

  const activeListings = listings.ok
    ? listings.data.filter((listing) => listing.status === "active")
    : [];
  const draftListings = listings.ok
    ? listings.data.filter((listing) => listing.status === "draft")
    : [];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Seller dashboard"
        organizations={organizations}
        selectedId={selectedId}
        role={role}
        unverifiedNotice={
          <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            This organization is waiting to be verified. Everything else works
            in the meantime — farms, fields, crops, tasks, and stock — but
            produce cannot be published to the marketplace until verification
            comes through.
          </p>
        }
        actions={
          <>
            <Link
              href={`/crops/new?org=${selectedId}`}
              className={secondaryButtonClass}
            >
              + Add New Crop
            </Link>
            {verified ? (
              <Link
                href={`/listings/new?org=${selectedId}`}
                className={primaryButtonClass}
              >
                + Create Listing
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active listings" value={activeListings.length} />
        <StatTile label="Drafts" value={draftListings.length} />
        <StatTile
          label="Offers to answer"
          value={pendingOffers.length}
          hint={received.length > 0 ? `${received.length} in total` : undefined}
        />
        <StatTile label="Crops" value={crops.ok ? crops.data.length : "—"} />
      </div>

      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="My Listings"
          count={listings.ok ? listings.data.length : undefined}
          action={
            verified ? (
              <Link
                href={`/listings/new?org=${selectedId}`}
                className={smallSecondaryButtonClass}
              >
                + Create Listing
              </Link>
            ) : null
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
                  <div className="flex flex-wrap items-start gap-4">
                    <CropVisual
                      name={listing.title}
                      cropName={listing.cropCycle?.crop.name}
                      size="sm"
                    />

                    <div className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{listing.title}</p>
                        <StatusBadge status={listing.status} />
                      </div>
                      {listing.description ? (
                        <p className="line-clamp-2 text-sm text-muted">
                          {listing.description}
                        </p>
                      ) : null}
                      {listing.cropCycle ? (
                        <p className="text-xs text-muted">
                          {listing.cropCycle.crop.variety
                            ? `${listing.cropCycle.crop.name} · ${listing.cropCycle.crop.variety}`
                            : listing.cropCycle.crop.name}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-0.5">
                      <Price value={listing.pricePerKg} size="sm" />
                      <p className="text-xs text-muted">
                        {formatDecimal(listing.quantityKg)} kg
                      </p>
                      <p className="text-xs text-muted">
                        {listing.availableFrom
                          ? `From ${formatDate(listing.availableFrom)}`
                          : "Available now"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <ListingActions
                      listingId={listing.id}
                      status={listing.status}
                    />
                    <Link
                      href={`/marketplace/${listing.id}`}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      View as a buyer sees it →
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="My Crops"
          count={crops.ok ? crops.data.length : undefined}
          action={
            <Link
              href={`/crops/new?org=${selectedId}`}
              className={smallSecondaryButtonClass}
            >
              + Add New Crop
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
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {crops.data.map((crop) => (
              <li key={crop.id}>
                <div className="flex h-full items-center gap-3 rounded-lg border border-line bg-surface p-4">
                  <CropVisual name={crop.name} cropName={crop.name} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate font-semibold text-ink">{crop.name}</p>
                    <p className="truncate text-sm text-muted">
                      {crop.variety ?? "No variety recorded"}
                    </p>
                    <p className="text-xs text-muted">
                      {crop.typicalDaysToHarvest
                        ? `${crop.typicalDaysToHarvest} days to harvest`
                        : "Time to harvest not recorded"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Offers Received"
          count={offers.ok ? received.length : undefined}
        />

        {!offers.ok ? (
          <LoadError message={offers.error} />
        ) : received.length === 0 ? (
          <EmptyState>
            No offers yet. Buyers can make one on any listing you have
            published to the marketplace.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {received.map((offer) => (
              <li key={offer.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`/marketplace/${offer.listing.id}`}
                        className="font-semibold text-ink hover:text-brand hover:underline"
                      >
                        {offer.listing.title}
                      </Link>
                      <p className="text-sm text-muted">
                        {offer.buyerOrganization.name}
                        {offer.buyer ? ` · ${offer.buyer.fullName}` : null}
                      </p>
                    </div>
                    <StatusBadge status={offer.status} />
                  </div>

                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Detail
                      label="Offered"
                      value={`${formatDecimal(offer.pricePerUnit)} / kg`}
                    />
                    <Detail
                      label="For"
                      value={`${formatDecimal(offer.quantity)} kg`}
                    />
                    <Detail
                      label="Total"
                      value={formatDecimal(
                        String(
                          Number(offer.pricePerUnit) * Number(offer.quantity),
                        ),
                      )}
                    />
                    <Detail
                      label="Offered on"
                      value={formatDate(offer.createdAt)}
                    />
                  </dl>

                  {offer.status === "pending" ? (
                    <OfferActions offerId={offer.id} />
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
