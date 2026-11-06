import { createHash } from 'node:crypto';

/**
 * Route identity is part of the ETag so different Location responses can
 * never share a cache entry even when they come from the same dataset version.
 */
export const LOCATION_ETAG_ROUTES = {
  countries: 'locations.countries',
  administrativeAreas: 'locations.countries.administrative-areas',
  addressRules: 'locations.countries.address-rules',
} as const;

export function buildLocationEtag(input: {
  version: string;
  checksum: string;
  route: string;
}): string {
  const digest = createHash('sha256')
    .update(`${input.version}\n${input.checksum}\n${input.route}`)
    .digest('hex');

  return `"${digest}"`;
}

/**
 * HTTP `If-None-Match` uses weak comparison, so a weak client tag still
 * matches the strong validator we publish.
 */
export function isLocationEtagFresh(
  ifNoneMatch: string | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch) {
    return false;
  }

  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//i, ''))
    .some((candidate) => candidate === '*' || candidate === etag);
}
