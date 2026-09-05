import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ListingCard } from "@/components/listing-card";
import {
  MarketplaceFilters,
  type Facet,
  type FilterState,
} from "@/components/marketplace-filters";
import { EmptyState, LoadError } from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { apiGet } from "@/lib/server-api";
import type { CropDTO, MarketplaceListingDTO, OrganizationDTO } from "@/lib/types";

export const metadata: Metadata = { title: "Marketplace · PreFarm" };

/** What `GET /api/listings` returns, with the relations that route includes. */
type ListingRow = MarketplaceListingDTO & {
  organization: Pick<
    OrganizationDTO,
    "id" | "name" | "organizationType" | "verifiedAt"
  >;
  cropCycle: {
    crop: CropDTO;
    field: { farm: { location: string | null } } | null;
  } | null;
};

const SORTS = {
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "quantity-desc": "Quantity: most first",
  newest: "Recently listed",
} as const;

type SortKey = keyof typeof SORTS;

const DEFAULT_SORT: SortKey = "price-asc";

/**
 * A query parameter as a single value. Anything can be typed into an address
 * bar, and a repeated `?crop=a&crop=b` arrives as an array — taking the first
 * entry keeps a hand-edited URL from breaking the page.
 */
function one(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

function priceOf(listing: ListingRow): number {
  const parsed = Number(listing.pricePerKg);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Everything a shopper might reasonably type the name of. */
function searchableText(listing: ListingRow): string {
  return [
    listing.title,
    listing.description,
    listing.cropCycle?.crop.name,
    listing.cropCycle?.crop.variety,
    listing.organization.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function cropNameOf(listing: ListingRow): string | null {
  return listing.cropCycle?.crop.name ?? null;
}

function locationOf(listing: ListingRow): string | null {
  return listing.cropCycle?.field?.farm.location ?? null;
}

/** Counts each distinct value, most common first, for one facet in the rail. */
function facetsOf(
  listings: ListingRow[],
  valueOf: (listing: ListingRow) => string | null,
): Facet[] {
  const counts = new Map<string, number>();

  for (const listing of listings) {
    const value = valueOf(listing);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const params = await searchParams;
  const query = one(params.q);
  const crop = one(params.crop);
  const location = one(params.location);
  const minPrice = one(params.minPrice);
  const maxPrice = one(params.maxPrice);
  const sort = (one(params.sort) ?? DEFAULT_SORT) as SortKey;
  const sortKey = sort in SORTS ? sort : DEFAULT_SORT;

  const selected: FilterState = {
    q: query,
    sort: sortKey === DEFAULT_SORT ? undefined : sortKey,
    crop,
    location,
    minPrice,
    maxPrice,
  };

  // The published market, which the API already scopes: every active listing
  // from a verified seller, plus the caller's own. Searching and filtering
  // then happen here rather than as more API parameters, so the facet counts
  // beside each option are counted from the same rows the grid is drawn from
  // and cannot disagree with it.
  const listings = await apiGet<ListingRow[]>(
    "/api/listings?status=active&limit=100",
  );

  const mine = new Set(session.memberships.map((m) => m.organizationId));
  const all = listings.ok ? listings.data : [];

  const term = query?.toLowerCase();
  const searched = term
    ? all.filter((listing) => searchableText(listing).includes(term))
    : all;

  // Facets are counted before the facet filters are applied, so choosing
  // "Tomato" leaves the other crops on screen with their counts intact —
  // otherwise every choice would dead-end at itself.
  const cropFacets = facetsOf(searched, cropNameOf);
  const locationFacets = facetsOf(searched, locationOf);

  const min = Number(minPrice);
  const max = Number(maxPrice);

  const results = searched
    .filter((listing) => (crop ? cropNameOf(listing) === crop : true))
    .filter((listing) => (location ? locationOf(listing) === location : true))
    .filter((listing) =>
      Number.isFinite(min) && minPrice ? priceOf(listing) >= min : true,
    )
    .filter((listing) =>
      Number.isFinite(max) && maxPrice ? priceOf(listing) <= max : true,
    )
    .sort((a, b) => {
      switch (sortKey) {
        case "price-desc":
          return priceOf(b) - priceOf(a);
        case "quantity-desc":
          return Number(b.quantityKg) - Number(a.quantityKg);
        case "newest":
          return b.createdAt.localeCompare(a.createdAt);
        default:
          return priceOf(a) - priceOf(b);
      }
    });

  /** A sort link that keeps the search and the filters already applied. */
  function sortHref(key: SortKey): string {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (crop) next.set("crop", crop);
    if (location) next.set("location", location);
    if (minPrice) next.set("minPrice", minPrice);
    if (maxPrice) next.set("maxPrice", maxPrice);
    if (key !== DEFAULT_SORT) next.set("sort", key);
    const search = next.toString();
    return `/marketplace${search ? `?${search}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Marketplace" },
          ...(query ? [{ label: `"${query}"` }] : crop ? [{ label: crop }] : []),
        ]}
      />

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight text-ink">Marketplace</h1>
          <p className="text-sm text-muted">
            Produce published by verified organizations across the platform.
          </p>
        </div>

        {/* The filters already applied travel as hidden fields, so searching
            narrows the current view instead of resetting it. */}
        <Form action="/marketplace" className="flex flex-col gap-2 sm:flex-row">
          {crop ? <input type="hidden" name="crop" value={crop} /> : null}
          {location ? (
            <input type="hidden" name="location" value={location} />
          ) : null}
          {minPrice ? <input type="hidden" name="minPrice" value={minPrice} /> : null}
          {maxPrice ? <input type="hidden" name="maxPrice" value={maxPrice} /> : null}
          {selected.sort ? (
            <input type="hidden" name="sort" value={selected.sort} />
          ) : null}

          <label htmlFor="marketplace-search" className="sr-only">
            Search the marketplace by crop name
          </label>
          <input
            id="marketplace-search"
            key={query ?? ""}
            name="q"
            type="search"
            defaultValue={query ?? ""}
            placeholder="Search by crop, produce, or seller — try “tomato”"
            className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
          >
            Search
          </button>
        </Form>
      </section>

      {!listings.ok ? (
        <LoadError message={listings.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr] lg:items-start">
          <aside className="lg:sticky lg:top-28">
            <MarketplaceFilters
              crops={cropFacets}
              locations={locationFacets}
              selected={selected}
            />
          </aside>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
              <p className="text-sm text-muted">
                <span className="font-semibold text-ink">{results.length}</span>{" "}
                {results.length === 1 ? "listing" : "listings"}
                {query ? (
                  <>
                    {" "}
                    for <span className="font-semibold text-ink">“{query}”</span>
                  </>
                ) : null}
                {all.length > results.length ? (
                  <span className="text-muted"> of {all.length} on the market</span>
                ) : null}
              </p>

              <div className="flex flex-wrap items-center gap-1">
                <span className="pr-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Sort by
                </span>
                {(Object.keys(SORTS) as SortKey[]).map((key) => (
                  <Link
                    key={key}
                    href={sortHref(key)}
                    aria-current={key === sortKey ? "true" : undefined}
                    className={
                      key === sortKey
                        ? "rounded-md bg-brand-tint px-2.5 py-1 text-xs font-semibold text-brand"
                        : "rounded-md px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
                    }
                  >
                    {SORTS[key]}
                  </Link>
                ))}
              </div>
            </div>

            {results.length === 0 ? (
              <EmptyState>
                {all.length === 0 ? (
                  "Nothing is on the market right now. Published listings from every verified organization appear here."
                ) : (
                  <>
                    No produce matches these filters.{" "}
                    <Link
                      href="/marketplace"
                      className="font-semibold text-brand hover:underline"
                    >
                      Clear the search and filters
                    </Link>{" "}
                    to see everything on the market.
                  </>
                )}
              </EmptyState>
            ) : (
              <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {results.map((listing) => (
                  <li key={listing.id} className="flex">
                    <ListingCard
                      listing={listing}
                      isOwn={mine.has(listing.organization.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
