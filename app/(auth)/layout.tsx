import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Layout for the signed-out pages.
 *
 * These are the only pages that must stay reachable without a session, so the
 * check runs the other way here: someone who is already signed in is sent to
 * the app rather than shown a sign-in form again.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (session) redirect("/");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <main className="flex w-full max-w-sm flex-col gap-6">
        <p className="text-sm font-semibold tracking-tight text-zinc-500 dark:text-zinc-400">
          AgriTech
        </p>
        {children}
      </main>
    </div>
  );
}
