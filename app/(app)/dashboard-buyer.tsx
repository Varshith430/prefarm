import Link from "next/link";

import { DashboardHeader } from "./dashboard-header";
import { CropVisual } from "@/components/crop-visual";
import { WithdrawBidButton } from "@/components/withdraw-bid-button";
import {
  Card,
  Detail,
  EmptyState,
  LoadError,
  SectionHeader,
  StatTile,
  StatusBadge,
  VerifiedBadge,
  formatDate,
  formatDecimal,
  primaryButtonClass,
  smallSecondaryButtonClass,
} from "@/components/ui";
import { apiGet } from "@/lib/server-api";
import type {
  MarketplaceListingDTO,
  OfferDTO,
  OrganizationDTO,
  UserDTO,
} from "@/lib/types";

/** An offer, from the side of the organization that placed it. */
type OfferRow = OfferDTO & {
  buyerOrganization: Pick<OrganizationDTO, "id" | "name" | "organizationType">;
  buyer: Pick<UserDTO, "id" | "fullName" | "email"> | null;
  listing: Pick<
    MarketplaceListingDTO,
    "id" | "title" | "organizationId" | "status" | "quantityKg" | "pricePerKg"
  > & {
    organization: Pick<OrganizationDTO, "id" | "name" | "verifiedAt">;
  };
};

/**
 * The dashboard for an organization that buys.
 *
 * There is nothing here about crops or listings: a buyer grows nothing and
 * sells nothing, so the whole of that half of the app is absent rather than
 * shown disabled. What is left is the thing a buyer actually does — the offers
 * they have out, and a way back to the market to make more.
 */
export async function BuyerDashboard({
  selectedId,
  role,
}: {
  selectedId: string;
  role: string | undefined;
}) {
  const [organizations, offers] = await Promise.all([
    apiGet<OrganizationDTO[]>("/api/organizations?limit=50"),
    // Narrowed to this organization's own offers by the API, which checks the
    // id against the caller's memberships before it answers.
    apiGet<OfferRow[]>(
      `/api/offers?buyerOrganizationId=${selectedId}&limit=100`,
    ),
  ]);

  const placed = offers.ok ? offers.data : [];
  const pending = placed.filter((offer) => offer.status === "pending");
  const accepted = placed.filter((offer) => offer.status === "accepted");
  const closed = placed.filter(
    (offer) => offer.status === "rejected" || offer.status === "withdrawn",
  );

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Buyer dashboard"
        organizations={organizations}
        selectedId={selectedId}
        role={role}
        actions={
          <Link href="/marketplace" className={primaryButtonClass}>
            Browse Marketplace
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Offers placed" value={placed.length} />
        <StatTile
          label="Awaiting reply"
          value={pending.length}
          hint={pending.length > 0 ? "the seller has not answered" : undefined}
        />
        <StatTile label="Accepted" value={accepted.length} />
        <StatTile label="Closed" value={closed.length} />
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="My Offers"
          count={offers.ok ? placed.length : undefined}
          action={
            <Link href="/marketplace" className={smallSecondaryButtonClass}>
              Browse Marketplace
            </Link>
          }
        />

        {!offers.ok ? (
          <LoadError message={offers.error} />
        ) : placed.length === 0 ? (
          <EmptyState>
            You have not made any offers yet.{" "}
            <Link
              href="/marketplace"
              className="font-semibold text-brand hover:underline"
            >
              Browse the marketplace
            </Link>{" "}
            to see what is on sale, and make an offer on anything you want.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {placed.map((offer) => {
              const total =
                Number(offer.pricePerUnit) * Number(offer.quantity);

              return (
                <li key={offer.id}>
                  <Card>
                    <div className="flex flex-wrap items-start gap-4">
                      <CropVisual name={offer.listing.title} size="sm" />

                      <div className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/marketplace/${offer.listing.id}`}
                            className="font-semibold text-ink hover:text-brand hover:underline"
                          >
                            {offer.listing.title}
                          </Link>
                          <StatusBadge status={offer.status} />
                        </div>
                        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                          Sold by {offer.listing.organization.name}
                          <VerifiedBadge
                            verifiedAt={offer.listing.organization.verifiedAt}
                          />
                        </p>
                        {offer.buyer ? (
                          <p className="text-xs text-muted">
                            Offered by {offer.buyer.fullName}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-5">
                      <Detail
                        label="You offered"
                        value={
                          <span className="font-semibold text-accent">
                            {formatDecimal(offer.pricePerUnit)} / kg
                          </span>
                        }
                      />
                      <Detail
                        label="Seller asking"
                        value={`${formatDecimal(offer.listing.pricePerKg)} / kg`}
                      />
                      <Detail
                        label="For"
                        value={`${formatDecimal(offer.quantity)} kg`}
                      />
                      <Detail label="Total" value={formatDecimal(String(total))} />
                      <Detail
                        label="Offered on"
                        value={formatDate(offer.createdAt)}
                      />
                    </dl>

                    {offer.status === "pending" ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                        <p className="text-sm text-muted">
                          Waiting for {offer.listing.organization.name} to
                          answer. You can withdraw it until they do.
                        </p>
                        <WithdrawBidButton offerId={offer.id} />
                      </div>
                    ) : offer.status === "accepted" ? (
                      <p className="border-t border-line pt-3 text-sm font-medium text-brand">
                        Accepted — settle the collection with{" "}
                        {offer.listing.organization.name} directly.
                      </p>
                    ) : null}
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
