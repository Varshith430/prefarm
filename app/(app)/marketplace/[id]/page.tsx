import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BidForm } from "@/components/bid-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CropVisual } from "@/components/crop-visual";
import { OfferActions } from "@/components/offer-actions";
import { WithdrawBidButton } from "@/components/withdraw-bid-button";
import {
  Card,
  Detail,
  EmptyState,
  LoadError,
  Price,
  SectionHeader,
  StatusBadge,
  VerifiedBadge,
  formatDate,
  formatDecimal,
} from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { apiGet } from "@/lib/server-api";
import type {
  CropDTO,
  MarketplaceListingDTO,
  OfferDTO,
  OrganizationDTO,
  UserDTO,
} from "@/lib/types";

export const metadata: Metadata = { title: "Listing · PreFarm" };

type ListingDetail = MarketplaceListingDTO & {
  organization: OrganizationDTO;
  cropCycle:
    | ({
        crop: CropDTO;
        season: string;
        harvestedOn: string | null;
        field: { name: string; farm: { name: string; location: string | null } };
      } | null)
    | null;
};

type OfferRow = OfferDTO & {
  buyerOrganization: Pick<OrganizationDTO, "id" | "name" | "organizationType">;
  buyer: Pick<UserDTO, "id" | "fullName" | "email"> | null;
};

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { id } = await params;

  const listing = await apiGet<ListingDetail>(`/api/listings/${id}`);

  if (!listing.ok) {
    // The API answers 404 for a listing that is not published and not yours,
    // so an unreadable listing is simply not found here either.
    return notFound();
  }

  // `GET /api/offers` already decides what this caller may see: every bid if
  // they are the seller, only their own if they are not. The page does not
  // re-implement that rule — it just renders what comes back.
  const offers = await apiGet<OfferRow[]>(`/api/offers?listingId=${id}&limit=50`);

  const isSeller = session.memberships.some(
    (m) => m.organizationId === listing.data.organization.id,
  );

  // Which organization would be bidding. Someone in several picks the first;
  // the API checks whichever id is sent against their memberships.
  const bidderOrganizationId = session.memberships.find(
    (m) => m.organizationId !== listing.data.organization.id,
  )?.organizationId;

  const myPendingBid = offers.ok
    ? offers.data.find((offer) => offer.status === "pending")
    : undefined;

  const crop = listing.data.cropCycle?.crop;
  const farm = listing.data.cropCycle?.field.farm;
  const total =
    Number(listing.data.pricePerKg) * Number(listing.data.quantityKg);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Marketplace", href: "/marketplace" },
          ...(crop
            ? [
                {
                  label: crop.name,
                  href: `/marketplace?crop=${encodeURIComponent(crop.name)}`,
                },
              ]
            : []),
          { label: listing.data.title },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="grid gap-5 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[16rem_minmax(0,1fr)]">
            <CropVisual
              name={listing.data.title}
              cropName={crop?.name}
              size="lg"
            />

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-ink">
                  {listing.data.title}
                </h1>
                <StatusBadge status={listing.data.status} />
              </div>

              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                Sold by
                <span className="font-semibold text-ink">
                  {listing.data.organization.name}
                </span>
                <VerifiedBadge
                  verifiedAt={listing.data.organization.verifiedAt}
                />
                {isSeller ? (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                    This is your listing
                  </span>
                ) : null}
              </p>

              {listing.data.description ? (
                <p className="text-sm leading-relaxed text-ink">
                  {listing.data.description}
                </p>
              ) : null}

              <dl className="grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-3">
                <Detail
                  label="Quantity"
                  value={`${formatDecimal(listing.data.quantityKg)} kg`}
                />
                <Detail
                  label="Available from"
                  value={formatDate(listing.data.availableFrom)}
                />
                <Detail label="Listed" value={formatDate(listing.data.createdAt)} />
                <Detail
                  label="Seller type"
                  value={listing.data.organization.organizationType.replace(
                    /_/g,
                    " ",
                  )}
                />
                <Detail
                  label="Location"
                  value={farm?.location ?? "Not stated"}
                />
                <Detail
                  label="Lot value"
                  value={formatDecimal(String(total))}
                />
              </dl>
            </div>
          </div>

          <Card>
            <SectionHeader title="Produce details" />
            {crop ? (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Detail label="Crop" value={crop.name} />
                <Detail label="Variety" value={crop.variety ?? "—"} />
                <Detail
                  label="Season"
                  value={listing.data.cropCycle?.season ?? "—"}
                />
                <Detail
                  label="Harvested"
                  value={formatDate(listing.data.cropCycle?.harvestedOn ?? null)}
                />
                <Detail label="Farm" value={farm?.name ?? "—"} />
                <Detail
                  label="Field"
                  value={listing.data.cropCycle?.field.name ?? "—"}
                />
              </dl>
            ) : (
              <p className="text-sm text-muted">
                The seller has not linked this listing to a harvest, so there is
                no crop, season, or field to show.
              </p>
            )}
          </Card>
        </div>

        {/* The buy box: price, what you get for it, and the one action that
            matters, kept in view beside the produce. */}
        <aside className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 lg:sticky lg:top-28">
          <div className="flex flex-col gap-1">
            <Price value={listing.data.pricePerKg} size="lg" />
            <p className="text-sm text-muted">
              {formatDecimal(listing.data.quantityKg)} kg available
            </p>
            {listing.data.availableFrom ? (
              <p className="text-sm text-muted">
                Ready from {formatDate(listing.data.availableFrom)}
              </p>
            ) : (
              <p className="text-sm font-semibold text-brand">Available now</p>
            )}
          </div>

          <div className="border-t border-line pt-3">
            {isSeller ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">
                  Buyers place their offers here. Answer them in{" "}
                  <span className="font-medium text-ink">Offers received</span>{" "}
                  below.
                </p>
                <Link
                  href="/"
                  className="text-sm font-semibold text-brand hover:underline"
                >
                  Back to your dashboard
                </Link>
              </div>
            ) : myPendingBid ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">Your offer</p>
                  <StatusBadge status={myPendingBid.status} />
                </div>
                <p className="text-sm text-ink">
                  {formatDecimal(myPendingBid.pricePerUnit)} / kg for{" "}
                  {formatDecimal(myPendingBid.quantity)} kg
                </p>
                <p className="text-sm text-muted">
                  Waiting for {listing.data.organization.name} to answer. You can
                  withdraw it until they do, and offer again afterwards.
                </p>
                <WithdrawBidButton offerId={myPendingBid.id} />
              </div>
            ) : !bidderOrganizationId ? (
              <p className="text-sm text-muted">
                Offers are placed on behalf of an organization, and you do not
                belong to one yet.{" "}
                <Link
                  href="/organizations/new"
                  className="font-semibold text-brand hover:underline"
                >
                  Create one
                </Link>{" "}
                or ask an owner to add you.
              </p>
            ) : listing.data.status !== "active" ? (
              <p className="text-sm text-muted">
                This listing is no longer open for offers.
              </p>
            ) : (
              <BidForm
                listingId={listing.data.id}
                organizationId={bidderOrganizationId}
                askingPrice={listing.data.pricePerKg}
                availableQuantity={listing.data.quantityKg}
              />
            )}
          </div>

          {/* The seller's copy of this failure belongs with their offer
              list below, so it is not repeated here. */}
          {!isSeller && !offers.ok ? <LoadError message={offers.error} /> : null}
        </aside>
      </div>

      {isSeller ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Offers received"
            count={offers.ok ? offers.data.length : undefined}
          />

          {!offers.ok ? (
            <LoadError message={offers.error} />
          ) : offers.data.length === 0 ? (
            <EmptyState>
              No offers yet. Buyers see this listing on the marketplace while it
              is published.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {offers.data.map((offer) => (
                <li key={offer.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <p className="font-semibold text-ink">
                          {offer.buyerOrganization.name}
                        </p>
                        <p className="text-sm text-muted">
                          {offer.buyer
                            ? `${offer.buyer.fullName} · ${offer.buyer.email}`
                            : "The person who bid has left this organization"}
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
                      <Detail label="Offered on" value={formatDate(offer.createdAt)} />
                    </dl>

                    {offer.status === "pending" ? (
                      <OfferActions offerId={offer.id} />
                    ) : offer.status === "withdrawn" ? (
                      <p className="text-sm text-muted">
                        The buyer took this offer back before it was answered.
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : offers.ok && offers.data.some((offer) => offer.status !== "pending") ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Your earlier offers" />
          <ul className="flex flex-col gap-2">
            {offers.data
              .filter((offer) => offer.status !== "pending")
              .map((offer) => (
                <li
                  key={offer.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink"
                >
                  <span>
                    {formatDecimal(offer.pricePerUnit)} / kg for{" "}
                    {formatDecimal(offer.quantity)} kg ·{" "}
                    {formatDate(offer.createdAt)}
                  </span>
                  <StatusBadge status={offer.status} />
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
