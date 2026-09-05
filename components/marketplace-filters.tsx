"use client";

import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

/** One value a facet can be narrowed to, with how many listings carry it. */
export interface Facet {
  value: string;
  count: number;
}

export interface FilterState {
  q?: string;
  sort?: string;
  crop?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
}

/**
 * The filter rail beside the marketplace grid.
 *
 * Every control writes to the URL through a `next/form`, so a filtered view
 * has an address that can be shared, bookmarked, and stepped back out of with
 * the browser's own Back button. Choosing a facet applies immediately, as it
 * does on a shopping site; the price range waits for its button, because
 * half-typed numbers are not a filter anybody asked for.
 *
 * The search term and sort order ride along as hidden fields — a `<form>`
 * submits only what it contains, so without them, filtering would silently
 * throw away what the shopper searched for.
 */
export function MarketplaceFilters({
  crops,
  locations,
  selected,
}: {
  crops: Facet[];
  locations: Facet[];
  selected: FilterState;
}) {
  const [open, setOpen] = useState(false);

  const active =
    (selected.crop ? 1 : 0) +
    (selected.location ? 1 : 0) +
    (selected.minPrice || selected.maxPrice ? 1 : 0);

  // Radios are a finished choice the moment they are clicked, so they apply
  // themselves. Typing in the price boxes is not, so it is left alone.
  function applyOnChoice(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.type === "radio") event.currentTarget.requestSubmit();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink lg:hidden"
      >
        <span>
          Filters
          {active > 0 ? (
            <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand">
              {active}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      <Form
        action="/marketplace"
        onChange={applyOnChoice}
        className={`${open ? "flex" : "hidden lg:flex"} flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface`}
      >
        {selected.q ? <input type="hidden" name="q" value={selected.q} /> : null}
        {selected.sort ? (
          <input type="hidden" name="sort" value={selected.sort} />
        ) : null}

        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink">
            Filters
          </h2>
          {active > 0 ? (
            <Link
              href={`/marketplace${clearedQuery(selected)}`}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Clear all
            </Link>
          ) : null}
        </div>

        {/* Keyed on the value in the URL: these inputs are uncontrolled, so
            without a remount a client-side navigation — "Clear all", or the
            Back button — would leave the previous choice ticked on screen
            while the results below it had already moved on. */}
        <FacetGroup
          key={`crop-${selected.crop ?? ""}`}
          legend="Crop type"
          name="crop"
          allLabel="All crops"
          options={crops}
          value={selected.crop}
        />

        <fieldset
          key={`price-${selected.minPrice ?? ""}-${selected.maxPrice ?? ""}`}
          className="flex flex-col gap-2 px-4 py-3"
        >
          <legend className="pb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Price per kg
          </legend>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="minPrice">
              Minimum price per kg
            </label>
            <input
              id="minPrice"
              name="minPrice"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="Min"
              defaultValue={selected.minPrice ?? ""}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <span className="text-xs text-muted">to</span>
            <label className="sr-only" htmlFor="maxPrice">
              Maximum price per kg
            </label>
            <input
              id="maxPrice"
              name="maxPrice"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="Max"
              defaultValue={selected.maxPrice ?? ""}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="self-start rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface"
          >
            Apply price
          </button>
        </fieldset>

        <FacetGroup
          key={`location-${selected.location ?? ""}`}
          legend="Location"
          name="location"
          allLabel="All locations"
          options={locations}
          value={selected.location}
        />

        {/* Without JavaScript nothing has applied itself, so the form still
            needs a way to be sent. */}
        <noscript>
          <div className="px-4 py-3">
            <button
              type="submit"
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white"
            >
              Apply filters
            </button>
          </div>
        </noscript>
      </Form>
    </div>
  );
}

/** Where "Clear all" goes: the same search and sort, with the facets dropped. */
function clearedQuery(selected: FilterState): string {
  const kept = new URLSearchParams();
  if (selected.q) kept.set("q", selected.q);
  if (selected.sort) kept.set("sort", selected.sort);
  const query = kept.toString();
  return query ? `?${query}` : "";
}

/** One radio list: "All crops", then every value the results actually have. */
function FacetGroup({
  legend,
  name,
  allLabel,
  options,
  value,
}: {
  legend: string;
  name: string;
  allLabel: string;
  options: Facet[];
  value?: string;
}) {
  if (options.length === 0) return null;

  const rowClass =
    "flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-ink transition hover:bg-surface-2";

  return (
    <fieldset className="flex flex-col px-4 py-3">
      <legend className="pb-2 text-xs font-bold uppercase tracking-wide text-muted">
        {legend}
      </legend>

      {/* Capped so a long tail of one-off values cannot push the results out
          of view; the search box is the way through a very long list. */}
      <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        <label className={rowClass}>
          <input
            type="radio"
            name={name}
            value=""
            defaultChecked={!value}
            className="accent-brand"
          />
          <span className="flex-1">{allLabel}</span>
        </label>

        {options.map((option) => (
          <label key={option.value} className={rowClass}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={value === option.value}
              className="accent-brand"
            />
            <span className="flex-1 truncate">{option.value}</span>
            <span className="text-xs tabular-nums text-muted">{option.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
