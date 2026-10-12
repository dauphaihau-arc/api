/**
 * Flat canonical category URL: `/c/:slug-c:publicId`. `c` is a URL-layer marker
 * only; it is never persisted. This is the single policy used for resolution
 * responses and (later) redirect destinations, so every generated link matches
 * the canonical destination.
 */
export function buildCategoryCanonicalPath(target: {
  id: string;
  slug: string;
}): string {
  return `/c/${target.slug}-c${target.id}`;
}
