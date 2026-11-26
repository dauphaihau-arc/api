import { normalizeCountryCode } from '~/domains/shipping/domain/shipping-destination-matcher';

/**
 * Query fragments that restrict catalog documents to those whose projected
 * Shipping Coverage includes the buyer's Preview Destination.
 *
 * This mirrors the eligibility rule in `app/shipping-coverage.ts`: Digital
 * Products bypass shipping, and `everywhere_else` coverage is projected as
 * `shipping.shipsWorldwide`, so both stay eligible. Without a Preview
 * Destination there is nothing to compare, so callers get no filter and
 * existing behavior is preserved (fail open).
 */
export function buildCatalogShippingCoverageMongoMatch(
  previewCountryCode?: string,
): Record<string, unknown> | undefined {
  const previewCountry = normalizeCountryCode(previewCountryCode);

  if (!previewCountry) {
    return undefined;
  }

  return {
    $or: [
      { isDigital: true },
      { 'shipping.shipsWorldwide': true },
      { 'shipping.shipsToCountryCodes': previewCountry },
    ],
  };
}

/** Atlas Search equivalent of {@link buildCatalogShippingCoverageMongoMatch}. */
export function buildCatalogShippingCoverageAtlasFilter(
  previewCountryCode?: string,
): Record<string, unknown> | undefined {
  const previewCountry = normalizeCountryCode(previewCountryCode);

  if (!previewCountry) {
    return undefined;
  }

  return {
    compound: {
      should: [
        { equals: { path: 'isDigital', value: true } },
        { equals: { path: 'shipping.shipsWorldwide', value: true } },
        { in: { path: 'shipping.shipsToCountryCodes', value: [previewCountry] } },
      ],
      minimumShouldMatch: 1,
    },
  };
}
