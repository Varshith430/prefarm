"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";

/**
 * The search box in the header.
 *
 * A `next/form` pointed at the marketplace, so submitting puts the term in the
 * URL (`/marketplace?q=…`) and the page reads it back — the same address a
 * shopper can bookmark or share. It works with JavaScript switched off, and
 * with it on Next.js turns the submission into a client-side navigation.
 *
 * A Client Component only so the box can show the term already being searched
 * for; the header around it stays on the server.
 */
export function HeaderSearch() {
  const searchParams = useSearchParams();
  const term = searchParams.get("q") ?? "";

  return (
    <Form
      action="/marketplace"
      className="flex w-full items-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-white"
    >
      <label htmlFor="site-search" className="sr-only">
        Search produce
      </label>
      <input
        id="site-search"
        // Uncontrolled, so it is keyed on the term in the URL: leaving a
        // search behind should empty the box rather than keep showing what
        // is no longer being searched for.
        key={term}
        name="q"
        type="search"
        defaultValue={term}
        placeholder="Search for crops, produce, sellers…"
        className="w-full bg-transparent px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Search"
        className="flex h-9 w-11 shrink-0 items-center justify-center bg-accent text-white transition hover:bg-accent-strong"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <circle cx="9" cy="9" r="6" />
          <path d="m13.5 13.5 4 4" strokeLinecap="round" />
        </svg>
      </button>
    </Form>
  );
}
