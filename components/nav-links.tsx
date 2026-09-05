"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The row of section links under the brand bar.
 *
 * A Client Component purely to mark the section you are in, the way the
 * category strip on a shopping site does. The links themselves are ordinary
 * `<Link>`s and work without JavaScript.
 */
export function NavLinks({
  items,
}: {
  items: { href: string; label: string; match?: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex items-center gap-1 overflow-x-auto"
    >
      {items.map((item) => {
        const target = item.match ?? item.href;
        const active =
          target === "/" ? pathname === "/" : pathname.startsWith(target);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "whitespace-nowrap rounded-md bg-brand-tint px-3 py-1.5 text-sm font-semibold text-brand"
                : "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
