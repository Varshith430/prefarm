import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentSession } from "@/lib/auth";

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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              AgriTech
            </Link>
            <Link
              href="/"
              className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
            >
              Dashboard
            </Link>
            <Link
              href="/marketplace"
              className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
            >
              Marketplace
            </Link>
            {session.isPlatformAdmin ? (
              <Link
                href="/admin"
                className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
              >
                Admin
              </Link>
            ) : null}
          </nav>

          <div className="flex items-center gap-3">
            <span
              className="truncate text-sm text-zinc-600 dark:text-zinc-400"
              title={session.user.email}
            >
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
