import Link from "next/link";

import { CropVisual } from "@/components/crop-visual";
import { Price, VerifiedBadge, formatDate, formatDecimal } from "@/components/ui";
import type { MarketplaceListingDTO } from "@/lib/types";

/** What a marketplace row carries, once the API's relations are included. */
export interface ListingCardData extends MarketplaceListingDTO {
  organization: { id: string; name: string; verifiedAt: string | null };
  cropCycle: {
    crop: { name: string; variety: string | null };
    field: { farm: { location: string | null } } | null;
  } | null;
}

function LocationLine({ location }: { location: string }) {
  return (
    <p className="flex items-center gap-1 text-xs text-muted">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-3 w-3">
        <path d="M8 1a5 5 0 0 0-5 5c0 3.6 4.3 8.5 4.5 8.7a.7.7 0 0 0 1 0C8.7 14.5 13 9.6 13 6a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
      </svg>
      <span className="truncate">{location}</span>
    </p>
  );
}

/**
 * One product card in the marketplace grid.
 *
 * The whole card is a single link, so the picture, the title, and the empty
 * space between them all open the listing — the target size shoppers expect
 * from a product tile.
 */
export function ListingCard({
  listing,
  isOwn,
}: {
  listing: ListingCardData;
  isOwn: boolean;
}) {
  const crop = listing.cropCycle?.crop;
  const location = listing.cropCycle?.field?.farm.location ?? null;

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group flex h-full w-full flex-col gap-3 rounded-lg border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="relative">
        <CropVisual name={listing.title} cropName={crop?.name} />
        {isOwn ? (
          <span className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-muted shadow-sm">
            Your listing
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <h3 className="line-clamp-2 text-sm font-semibold text-ink group-hover:text-brand">
          {listing.title}
        </h3>

        {crop ? (
          <p className="truncate text-xs text-muted">
            {crop.variety ? `${crop.name} · ${crop.variety}` : crop.name}
          </p>
        ) : null}

        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="truncate">{listing.organization.name}</span>
          <VerifiedBadge verifiedAt={listing.organization.verifiedAt} />
        </p>

        {location ? <LocationLine location={location} /> : null}

        <div className="mt-auto flex flex-col gap-0.5 pt-2">
          <Price value={listing.pricePerKg} />
          <p className="text-xs text-muted">
            {formatDecimal(listing.quantityKg)} kg available
          </p>
          {listing.availableFrom ? (
            <p className="text-xs text-muted">
              From {formatDate(listing.availableFrom)}
            </p>
          ) : (
            <p className="text-xs font-medium text-brand">Available now</p>
          )}
        </div>
      </div>
    </Link>
  );
}
