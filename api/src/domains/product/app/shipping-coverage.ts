import { normalizeCountryCode } from '~/domains/shipping/domain/shipping-destination-matcher';

/**
 * Denormalized Shipping Coverage of a Product's assigned Shipping Profile, as
 * projected into its catalog document. Country rates contribute their explicit
 * country; an `everywhere_else` rate sets `shipsWorldwide`.
 *
 * A missing or non-checkout-ready profile contributes no coverage at all, so a
 * physical Product without coverage is never presented as shippable.
 */
export interface CatalogShippingCoverage {
  shipsToCountryCodes: string[];
  shipsWorldwide: boolean;
}

export const EMPTY_CATALOG_SHIPPING_COVERAGE: CatalogShippingCoverage = {
  shipsToCountryCodes: [],
  shipsWorldwide: false,
};

/** Explicit catalog filter value that disables coverage filtering. */
export const CATALOG_SHIP_TO_ALL = 'all';

/**
 * Country a catalog list/facet request compares Shipping Coverage against.
 *
 * `catalog_ship_to=all` opts out of coverage filtering. An explicit ISO country
 * wins; otherwise the request Market's Preview Destination applies. An absent
 * result (unknown value or no Market destination) means "do not filter", which
 * keeps the previous fail-open behavior.
 */
export function resolveCatalogShipToCountry(
  catalogShipTo?: string,
  marketPreviewCountryCode?: string,
): string | undefined {
  if (catalogShipTo?.trim().toLowerCase() === CATALOG_SHIP_TO_ALL) {
    return undefined;
  }

  return normalizeCountryCode(catalogShipTo)
    || normalizeCountryCode(marketPreviewCountryCode)
    || undefined;
}

/**
 * Country a catalog card's `shipping.available` badge compares against.
 *
 * `all` disables filtering but still shows each card's badge relative to the
 * Market Preview Destination, so buyers keep seeing which items are unsupported
 * for their current Market. An explicit ISO country overrides the Market.
 */
export function resolveCatalogAvailabilityCountry(
  catalogShipTo?: string,
  marketPreviewCountryCode?: string,
): string | undefined {
  const explicitCountry = catalogShipTo?.trim().toLowerCase() === CATALOG_SHIP_TO_ALL
    ? ''
    : normalizeCountryCode(catalogShipTo);

  return explicitCountry
    || normalizeCountryCode(marketPreviewCountryCode)
    || undefined;
}

export interface CatalogShippingAvailabilityDocument {
  isDigital?: boolean;
  shipping?: Partial<CatalogShippingCoverage> | null;
}

/**
 * Whether a projected catalog Product can ship to the resolved destination
 * country. Catalog lists resolve that country from `catalog_ship_to` (explicit
 * country or the Market Preview Destination); other surfaces keep passing the
 * Preview Destination. Digital Products bypass shipping entirely.
 *
 * Without a destination country there is nothing to compare, so the Product
 * stays available rather than claiming an unsupported region.
 */
export function isCatalogShippingAvailable(
  document: CatalogShippingAvailabilityDocument,
  destinationCountryCode?: string,
): boolean {
  if (document.isDigital === true) {
    return true;
  }

  const destinationCountry = normalizeCountryCode(destinationCountryCode);

  if (!destinationCountry) {
    return true;
  }

  if (document.shipping?.shipsWorldwide === true) {
    return true;
  }

  return (document.shipping?.shipsToCountryCodes ?? []).some(
    (countryCode) => normalizeCountryCode(countryCode) === destinationCountry,
  );
}

/** Wire-shaped availability shared by every storefront card mapper. */
export function toCatalogShippingAvailability(
  document: CatalogShippingAvailabilityDocument,
  destinationCountryCode?: string,
): { available: boolean } {
  return {
    available: isCatalogShippingAvailable(document, destinationCountryCode),
  };
}
