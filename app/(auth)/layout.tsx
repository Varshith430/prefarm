import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
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
    <div className="flex flex-1 items-center justify-center bg-page px-4 py-12">
      <main className="flex w-full max-w-sm flex-col gap-5">
        <span className="self-center">
          <Logo tone="brand" />
        </span>
        <div className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
