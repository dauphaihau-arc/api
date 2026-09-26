import { resolveCountryCode } from '~/shared/utils/country-code';
import { ShippingDestinationScope } from './enums/shipping-destination-scope.enum';

/**
 * A configured destination rate as the matcher needs to see it. Persistence,
 * HTTP, and application layers map onto this shape.
 */
export interface ShippingDestinationRate {
  id: string;
  position: number;
  destinationScope: ShippingDestinationScope;
  destinationCountry?: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  deliveryTimeMinDays?: number;
  deliveryTimeMaxDays?: number;
}

/**
 * Normalized structured destination fields. Display strings, free-text
 * addresses, and relative location rules are never used for matching.
 */
export interface ShippingDestination {
  countryCode: string;
}

export type ShippingRateMatch =
  | { matched: true; rate: ShippingDestinationRate }
  | { matched: false };

const SCOPE_SPECIFICITY: Record<ShippingDestinationScope, number> = {
  [ShippingDestinationScope.COUNTRY]: 1,
  [ShippingDestinationScope.EVERYWHERE_ELSE]: 0,
};

/**
 * Canonical alpha-2 country code for a configured rate or a destination.
 * Buyer addresses carry display names while configured rates carry codes, so
 * both vocabularies resolve to the same canonical code here.
 */
export function normalizeCountryCode(value: string | undefined): string {
  return resolveCountryCode(value);
}

/**
 * Deterministic destination matching: the configured country wins, then an
 * optional EVERYWHERE_ELSE catch-all. Absence of any match means the
 * destination is unsupported.
 *
 * Equal-country duplicates are rejected at configuration time, so the position
 * and identity tie-break exists only to keep migrated data stable.
 */
export function matchDestinationRate(
  rates: readonly ShippingDestinationRate[],
  destination: ShippingDestination,
): ShippingRateMatch {
  const countryCode = normalizeCountryCode(destination.countryCode);

  if (!countryCode) {
    return { matched: false };
  }

  let best: { rate: ShippingDestinationRate; specificity: number } | undefined;

  for (const rate of rates) {
    if (!rateMatchesDestination(rate, countryCode)) {
      continue;
    }

    const specificity = SCOPE_SPECIFICITY[rate.destinationScope];

    const isMoreSpecific = best === undefined
      || specificity > best.specificity
      || (specificity === best.specificity && compareRates(rate, best.rate) < 0);

    if (isMoreSpecific) {
      best = { rate, specificity };
    }
  }

  return best ? { matched: true, rate: best.rate } : { matched: false };
}

function rateMatchesDestination(
  rate: ShippingDestinationRate,
  countryCode: string,
): boolean {
  switch (rate.destinationScope) {
    case ShippingDestinationScope.COUNTRY:
      return normalizeCountryCode(rate.destinationCountry) === countryCode;
    case ShippingDestinationScope.EVERYWHERE_ELSE:
      return true;
    default:
      return false;
  }
}

function compareRates(
  left: ShippingDestinationRate,
  right: ShippingDestinationRate,
): number {
  if (left.position !== right.position) {
    return left.position - right.position;
  }

  return left.id.localeCompare(right.id);
}
