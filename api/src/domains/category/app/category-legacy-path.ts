/**
 * Legacy hierarchical category paths were captured as `/c/<segment>...` with
 * exactly one recorded owner. They are matched as opaque keys, so validation
 * only rejects shapes that cannot be a recorded path: not under `/c/`, an empty
 * remainder, a trailing slash (canonical paths never end in one), or a query,
 * fragment, or whitespace character. Anything else is a lookup candidate; an
 * unknown-but-well-formed path resolves to `null` (404), never a parent guess.
 */
const CATEGORY_LEGACY_PATH_QUERY_OR_FRAGMENT = /[?#\s]/;

export function isCategoryLegacyPath(value: string): boolean {
  if (!value.startsWith('/c/') || value.endsWith('/')) {
    return false;
  }

  return value.length > '/c/'.length
    && !CATEGORY_LEGACY_PATH_QUERY_OR_FRAGMENT.test(value);
}
