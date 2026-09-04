/**
 * Derives a URL-safe slug from a display name, matching the format enforced by
 * `slugSchema`: lowercase alphanumerics separated by single hyphens.
 *
 * Returns an empty string when the input has no slug-able characters (for
 * example a name written entirely in emoji), which callers must reject.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

/**
 * Finds a free slug for a display name.
 *
 * Two organizations may legitimately share a name — they are different
 * tenants — so a collision takes a short random suffix
 * (`green-valley-farms-7f3a`) rather than failing a request the caller has no
 * way to fix, since the slug is derived rather than typed. The caller supplies
 * `isTaken` so this stays free of any database import.
 *
 * Returns null when even the suffixed attempts collide, which the caller
 * should treat as a conflict rather than looping forever.
 */
export async function availableSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  attempts = 5,
): Promise<string | null> {
  if (!(await isTaken(base))) return base;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  return null;
}
