import Link from "next/link";
import { Suspense } from "react";

import { AccountMenu } from "@/components/account-menu";
import { HeaderSearch } from "@/components/header-search";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";

/**
 * The bar across the top of every signed-in page.
 *
 * Laid out the way a shopper already knows: logo on the left, search filling
 * the middle, account on the right, and a strip of sections underneath. It is
 * a Server Component so the session it renders never reaches the browser as
 * data — only the three small interactive pieces inside it are client-side.
 */
export function SiteHeader({
  fullName,
  email,
  isPlatformAdmin,
  canSell,
}: {
  fullName: string;
  email: string;
  isPlatformAdmin: boolean;
  /**
   * Whether any organization this person belongs to sells produce. A buyer has
   * no listings or crops to reach, so those sections are absent rather than
   * shown and then refused.
   */
  canSell: boolean;
}) {
  const sections = [
    { href: "/", label: "Dashboard" },
    { href: "/marketplace", label: "Marketplace" },
    ...(canSell
      ? [
          { href: "/listings/new", label: "Create listing" },
          { href: "/crops/new", label: "Add crop" },
        ]
      : []),
    ...(isPlatformAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-brand">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link
            href="/"
            className="shrink-0 rounded-md px-1 py-1 transition hover:opacity-90"
          >
            <Logo />
          </Link>

          <div className="mx-auto w-full max-w-2xl">
            {/* The box reads the current term out of the URL, so it is
                rendered on the client behind a boundary of its own. */}
            <Suspense
              fallback={<div className="h-9 w-full rounded-md bg-white/90" />}
            >
              <HeaderSearch />
            </Suspense>
          </div>

          {canSell ? (
            <Link
              href="/listings/new"
              className="hidden shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold text-white/90 transition hover:bg-white/10 lg:block"
            >
              Sell produce
            </Link>
          ) : null}

          <AccountMenu
            fullName={fullName}
            email={email}
            isPlatformAdmin={isPlatformAdmin}
          />
        </div>
      </div>

      <div className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-7xl px-4 py-1.5">
          <NavLinks items={sections} />
        </div>
      </div>
    </header>
  );
}
