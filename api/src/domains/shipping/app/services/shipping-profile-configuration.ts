import { ShippingDestinationScope } from '../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../domain/enums/shipping-profile-status.enum';
import { normalizeCountryCode } from '../../domain/shipping-destination-matcher';
import {
  isCompleteDurationRange,
  isValidDurationRange,
} from '../../domain/shipping-duration-range';
import { InvalidShippingProfileError } from '../errors/shipping-app.error';
import type { ShippingRateInput } from '../shipping.types';

const MAX_RATES = 100;
const MAX_FEE_MINOR = 100_000_000;
const MAX_NAME_LENGTH = 80;
const MAX_POSTAL_LENGTH = 20;
const MIN_POSTAL_LENGTH = 2;

/**
 * Postal formats are country-specific and Arc holds no postal-format dataset, so
 * the rule stays permissive: letters, digits, spaces, and hyphens cover the
 * shapes sellers actually use (`10001`, `SW1A 1AA`, `K1A 0B1`, `12345-6789`)
 * without inventing a format per destination.
 */
const POSTAL_CODE_PATTERN = /^[A-Z0-9 -]+$/;

export interface ShippingProfileConfigurationInput {
  name: string;
  status: ShippingProfileStatus;
  shipFromCountry?: string;
  shipFromPostal?: string;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates: ShippingRateInput[];
}

export interface NormalizedShippingProfileConfiguration {
  name: string;
  normalizedName: string;
  status: ShippingProfileStatus;
  shipFromCountry?: string;
  shipFromPostal?: string;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates: ShippingRateInput[];
}

export function normalizeShippingProfileName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizeShippingProfileConfiguration(
  input: ShippingProfileConfigurationInput,
): { error: InvalidShippingProfileError } | { configuration: NormalizedShippingProfileConfiguration } {
  const name = input.name.trim();

  if (name.length === 0) {
    return { error: new InvalidShippingProfileError('Shipping profile name is required') };
  }

  if (name.length > MAX_NAME_LENGTH) {
    return {
      error: new InvalidShippingProfileError(
        `Shipping profile name must be at most ${MAX_NAME_LENGTH} characters`,
      ),
    };
  }

  if (input.status === ShippingProfileStatus.ARCHIVED) {
    return {
      error: new InvalidShippingProfileError('Use the archive action to archive a shipping profile'),
    };
  }

  const shipFromCountry = input.shipFromCountry?.trim().toUpperCase();

  if (shipFromCountry !== undefined && !/^[A-Z]{2}$/.test(shipFromCountry)) {
    return { error: new InvalidShippingProfileError('Ship-from country must be a 2-letter country code') };
  }

  const shipFromPostal = input.shipFromPostal
    ?.trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

  if (shipFromPostal !== undefined && shipFromPostal.length > 0) {
    if (shipFromPostal.length < MIN_POSTAL_LENGTH || shipFromPostal.length > MAX_POSTAL_LENGTH) {
      return {
        error: new InvalidShippingProfileError(
          `Ship-from postal code must be between ${MIN_POSTAL_LENGTH} and ${MAX_POSTAL_LENGTH} characters`,
        ),
      };
    }

    if (!POSTAL_CODE_PATTERN.test(shipFromPostal)) {
      return {
        error: new InvalidShippingProfileError(
          'Ship-from postal code can only contain letters, numbers, spaces, and hyphens',
        ),
      };
    }
  }

  const processingRangeError = validateDurationRange(
    'Processing time',
    input.processingTimeMinDays,
    input.processingTimeMaxDays,
  );

  if (processingRangeError) {
    return { error: processingRangeError };
  }

  if (input.rates.length > MAX_RATES) {
    return { error: new InvalidShippingProfileError(`A shipping profile supports at most ${MAX_RATES} rates`) };
  }

  const rates: ShippingRateInput[] = [];
  const seenScopes = new Set<string>();
  let everywhereElseCount = 0;

  for (const rate of input.rates) {
    const normalized = normalizeRate(rate);

    if ('error' in normalized) {
      return normalized;
    }

    if (normalized.rate.destinationScope === ShippingDestinationScope.EVERYWHERE_ELSE) {
      everywhereElseCount += 1;

      if (everywhereElseCount > 1) {
        return { error: new InvalidShippingProfileError('Only one EVERYWHERE_ELSE rate is allowed') };
      }
    }

    const scopeKey = [
      normalized.rate.destinationScope,
      normalized.rate.destinationCountry ?? '',
    ].join('|');

    if (seenScopes.has(scopeKey)) {
      return {
        error: new InvalidShippingProfileError(
          `Duplicate shipping rate for destination ${formatScope(normalized.rate)}`,
        ),
      };
    }

    seenScopes.add(scopeKey);
    rates.push(normalized.rate);
  }

  if (input.status === ShippingProfileStatus.ACTIVE) {
    if (rates.length === 0) {
      return { error: new InvalidShippingProfileError('An active shipping profile requires at least one rate') };
    }

    if (!isValidDurationRange(input.processingTimeMinDays, input.processingTimeMaxDays)) {
      return {
        error: new InvalidShippingProfileError(
          'An active shipping profile requires a complete Processing time range in calendar days',
        ),
      };
    }

    if (
      rates.some((rate) => !isValidDurationRange(rate.deliveryTimeMinDays, rate.deliveryTimeMaxDays))
    ) {
      return {
        error: new InvalidShippingProfileError(
          'An active shipping profile requires a complete Delivery time range on every destination rate',
        ),
      };
    }
  }

  return {
    configuration: {
      name,
      normalizedName: normalizeShippingProfileName(name),
      status: input.status,
      shipFromCountry,
      shipFromPostal: shipFromPostal && shipFromPostal.length > 0 ? shipFromPostal : undefined,
      processingTimeMinDays: input.processingTimeMinDays,
      processingTimeMaxDays: input.processingTimeMaxDays,
      rates,
    },
  };
}

function normalizeRate(
  rate: ShippingRateInput,
): { error: InvalidShippingProfileError } | { rate: ShippingRateInput } {
  const destinationCountry = rate.destinationCountry === undefined
    ? undefined
    : normalizeCountryCode(rate.destinationCountry);

  if (!Number.isInteger(rate.oneItemFeeMinor) || rate.oneItemFeeMinor < 0 || rate.oneItemFeeMinor > MAX_FEE_MINOR) {
    return {
      error: new InvalidShippingProfileError(
        'One-item fee must be a non-negative minor-unit amount',
      ),
    };
  }

  if (
    !Number.isInteger(rate.additionalItemFeeMinor)
    || rate.additionalItemFeeMinor < 0
    || rate.additionalItemFeeMinor > MAX_FEE_MINOR
  ) {
    return {
      error: new InvalidShippingProfileError(
        'Additional-item fee must be a non-negative minor-unit amount',
      ),
    };
  }

  const deliveryRangeError = validateDurationRange(
    'Delivery time',
    rate.deliveryTimeMinDays,
    rate.deliveryTimeMaxDays,
  );

  if (deliveryRangeError) {
    return { error: deliveryRangeError };
  }

  switch (rate.destinationScope) {
    case ShippingDestinationScope.COUNTRY:
      if (!destinationCountry || !/^[A-Z]{2}$/.test(destinationCountry)) {
        return {
          error: new InvalidShippingProfileError(
            'A COUNTRY rate requires a 2-letter country code',
          ),
        };
      }

      break;
    case ShippingDestinationScope.EVERYWHERE_ELSE:
      if (destinationCountry) {
        return {
          error: new InvalidShippingProfileError('An EVERYWHERE_ELSE rate must not name a destination'),
        };
      }

      break;
    default:
      return { error: new InvalidShippingProfileError('Shipping rate destination scope is invalid') };
  }

  return {
    rate: {
      destinationScope: rate.destinationScope,
      destinationCountry,
      oneItemFeeMinor: rate.oneItemFeeMinor,
      additionalItemFeeMinor: rate.additionalItemFeeMinor,
      deliveryTimeMinDays: rate.deliveryTimeMinDays,
      deliveryTimeMaxDays: rate.deliveryTimeMaxDays,
    },
  };
}

/**
 * A duration range is either absent (allowed for drafts, reported as a
 * readiness issue) or a complete non-negative integer range with
 * minimum no greater than maximum.
 */
function validateDurationRange(
  label: string,
  minDays: number | undefined,
  maxDays: number | undefined,
): InvalidShippingProfileError | null {
  // A wholly absent range is a readiness concern, not a malformed value: a
  // draft may be saved without one and is reported as incomplete until the
  // seller supplies it.
  if (minDays === undefined && maxDays === undefined) {
    return null;
  }

  if (!isCompleteDurationRange(minDays, maxDays)) {
    return new InvalidShippingProfileError(
      `${label} needs both a minimum and a maximum in calendar days`,
    );
  }

  if (!isValidDurationRange(minDays, maxDays)) {
    return new InvalidShippingProfileError(
      `${label} must be non-negative whole calendar days with the minimum no greater than the maximum`,
    );
  }

  return null;
}

function formatScope(rate: ShippingRateInput): string {
  return rate.destinationCountry ?? rate.destinationScope;
}
