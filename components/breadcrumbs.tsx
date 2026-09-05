import Link from "next/link";
import { Fragment } from "react";

/**
 * The trail above a page title: Home > Marketplace > Tomatoes.
 *
 * The last entry is where you are, so it is plain text carrying
 * `aria-current="page"` rather than a link back to itself.
 */
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="flex items-center gap-1">
                {item.href && !last ? (
                  <Link
                    href={item.href}
                    className="transition hover:text-brand hover:underline"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={last ? "max-w-[24rem] truncate font-medium text-ink" : ""}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {last ? null : (
                <li aria-hidden="true" className="text-muted/50">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M6 3.5 10.5 8 6 12.5 5 11.5 8.5 8 5 4.5Z" />
                  </svg>
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
