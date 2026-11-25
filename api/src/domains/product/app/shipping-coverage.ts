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

export interface CatalogShippingAvailabilityDocument {
  isDigital?: boolean;
  shipping?: Partial<CatalogShippingCoverage> | null;
}

/**
 * Whether a projected catalog Product can ship to the buyer's server-derived
 * Preview Destination. Digital Products bypass shipping entirely.
 *
 * Without a Preview Destination there is nothing to compare, so the Product
 * stays available rather than claiming an unsupported region.
 */
export function isCatalogShippingAvailable(
  document: CatalogShippingAvailabilityDocument,
  previewCountryCode?: string,
): boolean {
  if (document.isDigital === true) {
    return true;
  }

  const previewCountry = normalizeCountryCode(previewCountryCode);

  if (!previewCountry) {
    return true;
  }

  if (document.shipping?.shipsWorldwide === true) {
    return true;
  }

  return (document.shipping?.shipsToCountryCodes ?? []).some(
    (countryCode) => normalizeCountryCode(countryCode) === previewCountry,
  );
}

/** Wire-shaped availability shared by every storefront card mapper. */
export function toCatalogShippingAvailability(
  document: CatalogShippingAvailabilityDocument,
  previewCountryCode?: string,
): { available: boolean } {
  return {
    available: isCatalogShippingAvailable(document, previewCountryCode),
  };
}
