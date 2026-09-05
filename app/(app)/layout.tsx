import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { getCurrentSession } from "@/lib/auth";
import { sellsProduce } from "@/lib/org-types";

// The session is read from a cookie on every request, so these pages can never
// be prerendered or served from a cache shared between users.
export const dynamic = "force-dynamic";

/**
 * Layout for everything behind a sign-in.
 *
 * The redirect here is what makes the pages private in the browser; it is not
 * what makes the data private. Each API route runs its own `requireUser()` and
 * membership checks, so a request that skips the UI entirely is still refused.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // Someone who belongs to a farm and to a buyer keeps the selling sections:
  // the header spans every organization they are in, and the pages behind
  // those links do their own per-organization check.
  const canSell = session.memberships.some((membership) =>
    sellsProduce(membership.organizationType),
  );

  return (
    <div className="flex flex-1 flex-col bg-page">
      <SiteHeader
        fullName={session.user.fullName}
        email={session.user.email}
        isPlatformAdmin={session.isPlatformAdmin}
        canSell={canSell}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted">
          <p>PreFarm — farm, crop, telemetry, and marketplace management.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link href="/" className="transition hover:text-brand">
              Dashboard
            </Link>
            <Link href="/marketplace" className="transition hover:text-brand">
              Marketplace
            </Link>
            <Link href="/organizations/new" className="transition hover:text-brand">
              Create an organization
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
