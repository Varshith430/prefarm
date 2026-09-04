import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BidForm } from "@/components/bid-form";
import { OfferActions } from "@/components/offer-actions";
import { WithdrawBidButton } from "@/components/withdraw-bid-button";
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
  OfferDTO,
  OrganizationDTO,
  UserDTO,
} from "@/lib/types";

export const metadata: Metadata = { title: "Listing · AgriTech" };

type ListingDetail = MarketplaceListingDTO & {
  organization: OrganizationDTO;
  cropCycle:
    | (({ crop: CropDTO } & { season: string; harvestedOn: string | null }) | null)
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/marketplace"
          className="text-sm text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
        >
          Back to marketplace
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {listing.data.title}
          </h1>
          <StatusBadge status={listing.data.status} />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sold by {listing.data.organization.name}
          {isSeller ? " — this is your listing" : null}
        </p>
      </div>

      <Card>
        {listing.data.description ? (
          <p className="text-sm">{listing.data.description}</p>
        ) : null}

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail
            label="Asking price"
            value={`${formatDecimal(listing.data.pricePerKg)} / kg`}
          />
          <Detail
            label="Quantity"
            value={`${formatDecimal(listing.data.quantityKg)} kg`}
          />
          <Detail
            label="Available from"
            value={formatDate(listing.data.availableFrom)}
          />
          <Detail label="Listed" value={formatDate(listing.data.createdAt)} />
        </dl>

        {crop ? (
          <dl className="grid grid-cols-2 gap-4 border-t border-zinc-200 pt-3 sm:grid-cols-4 dark:border-zinc-800">
            <Detail label="Crop" value={crop.name} />
            <Detail label="Variety" value={crop.variety ?? "—"} />
            <Detail label="Season" value={listing.data.cropCycle?.season ?? "—"} />
            <Detail
              label="Harvested"
              value={formatDate(listing.data.cropCycle?.harvestedOn ?? null)}
            />
          </dl>
        ) : (
          <p className="border-t border-zinc-200 pt-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            The seller has not linked this listing to a harvest.
          </p>
        )}
      </Card>

      {isSeller ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Bids received"
            count={offers.ok ? offers.data.length : undefined}
          />

          {!offers.ok ? (
            <LoadError message={offers.error} />
          ) : offers.data.length === 0 ? (
            <EmptyState>
              No bids yet. Buyers see this listing on the marketplace while it
              is published.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {offers.data.map((offer) => (
                <li key={offer.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <p className="font-medium">
                          {offer.buyerOrganization.name}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
                          String(Number(offer.pricePerUnit) * Number(offer.quantity)),
                        )}
                      />
                      <Detail label="Bid on" value={formatDate(offer.createdAt)} />
                    </dl>

                    {offer.status === "pending" ? (
                      <OfferActions offerId={offer.id} />
                    ) : offer.status === "withdrawn" ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        The buyer took this bid back before it was answered.
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Your bid" />

          {!offers.ok ? (
            <LoadError message={offers.error} />
          ) : myPendingBid ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm">
                  You have offered{" "}
                  <strong>{formatDecimal(myPendingBid.pricePerUnit)} / kg</strong>{" "}
                  for <strong>{formatDecimal(myPendingBid.quantity)} kg</strong>.
                </p>
                <StatusBadge status={myPendingBid.status} />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Waiting for {listing.data.organization.name} to answer. You can
                withdraw it until they do, and bid again afterwards.
              </p>
              <WithdrawBidButton offerId={myPendingBid.id} />
            </Card>
          ) : !bidderOrganizationId ? (
            <EmptyState>
              Bidding is done on behalf of an organization, and you do not
              belong to one yet. Ask an owner to add you, or create your own.
            </EmptyState>
          ) : listing.data.status !== "active" ? (
            <EmptyState>This listing is no longer open for offers.</EmptyState>
          ) : (
            <Card>
              <BidForm
                listingId={listing.data.id}
                organizationId={bidderOrganizationId}
                askingPrice={listing.data.pricePerKg}
                availableQuantity={listing.data.quantityKg}
              />
            </Card>
          )}

          {offers.ok && offers.data.some((o) => o.status !== "pending") ? (
            <ul className="flex flex-col gap-2">
              {offers.data
                .filter((offer) => offer.status !== "pending")
                .map((offer) => (
                  <li
                    key={offer.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800"
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
          ) : null}
        </section>
      )}
    </div>
  );
}
