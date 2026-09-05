"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";

/**
 * The account dropdown at the right of the header.
 *
 * Closes on Escape, on a click outside it, and whenever the route changes —
 * the three ways a menu on a shopping site is expected to go away. The menu is
 * a real `<nav>` of links, so everything in it is reachable by keyboard and
 * openable in a new tab.
 */
export function AccountMenu({
  fullName,
  email,
  isPlatformAdmin,
}: {
  fullName: string;
  email: string;
  isPlatformAdmin: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // What is held is the route the menu was opened on, not a bare boolean, so
  // navigating away closes it as a matter of arithmetic — a menu left hanging
  // over the page it linked to is the thing being avoided, and deriving it
  // here costs no extra render.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  useEffect(() => {
    if (!open) return;

    // The state setter is used directly rather than the helper above, so the
    // listeners are attached once per open rather than on every render.
    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpenedAt(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedAt(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemClass =
    "block rounded-md px-3 py-2 text-sm text-ink transition hover:bg-surface-2";

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-white/90 transition hover:bg-white/10"
      >
        <span className="hidden leading-tight sm:block">
          <span className="block text-[11px] text-white/70">Hello,</span>
          <span className="block max-w-[10rem] truncate font-semibold text-white">
            {fullName.split(" ")[0]}
          </span>
        </span>
        <span className="sm:hidden">Account</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
        >
          <path d="M5.2 7.5 10 12.3l4.8-4.8H5.2Z" />
        </svg>
      </button>

      {open ? (
        <nav
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-line bg-surface p-2 shadow-lg"
        >
          <p className="truncate border-b border-line px-3 pb-2 text-xs text-muted">
            {email}
          </p>
          <Link href="/" className={itemClass}>
            Dashboard
          </Link>
          <Link href="/marketplace" className={itemClass}>
            Marketplace
          </Link>
          <Link href="/organizations/new" className={itemClass}>
            Create an organization
          </Link>
          {isPlatformAdmin ? (
            <Link href="/admin" className={itemClass}>
              Platform administration
            </Link>
          ) : null}
          <div className="mt-1 border-t border-line px-1 pt-2">
            <SignOutButton />
          </div>
        </nav>
      ) : null}
    </div>
  );
}
