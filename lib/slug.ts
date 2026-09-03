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
