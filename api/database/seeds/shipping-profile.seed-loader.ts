import * as path from 'node:path';
import { ShippingDestinationScope } from '~/domains/shipping/domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import { collectShippingProfileReadinessIssues } from '~/domains/shipping/domain/shipping-profile-readiness';
import {
  SHIPPING_PROFILES_LOCAL_TSV_PATH,
  SHIPPING_PROFILES_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

/**
 * Wildcard shop slug: a row carrying it seeds the profile for every shop the
 * demo seeder creates. A row naming a shop explicitly replaces the wildcard row
 * with the same profile name for that shop only.
 */
export const SHIPPING_PROFILE_ALL_SHOPS_SLUG = '*';

export type ShippingProfileRateSeed = {
  destinationScope: ShippingDestinationScope;
  destinationCountry?: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  deliveryTimeMinDays?: number;
  deliveryTimeMaxDays?: number;
};

export type ShippingProfileSeed = {
  shopSlug: string;
  name: string;
  normalizedName: string;
  status: ShippingProfileStatus;
  isDefault: boolean;
  shipFromCountry?: string;
  shipFromPostal?: string;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates: ShippingProfileRateSeed[];
};

type ShippingProfileCsvRow = {
  shop_slug: string;
  name: string;
  status: string;
  is_default: string;
  ship_from_country: string;
  ship_from_postal: string;
  processing_time_min_days: string;
  processing_time_max_days: string;
  rates_json: string;
};

const SHIPPING_PROFILE_NAME_MAX_LENGTH = 80;
const SHIPPING_PROFILE_POSTAL_MAX_LENGTH = 20;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

function parseOptionalInteger(
  value: string,
  fieldName: string,
  seedKey: string,
): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  if (!NON_NEGATIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new Error(`Invalid ${fieldName} "${value}" for shipping profile seed ${seedKey}`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${fieldName} "${value}" for shipping profile seed ${seedKey}`);
  }

  return parsed;
}

function parseOptionalCountry(
  value: string,
  fieldName: string,
  seedKey: string,
): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  if (!COUNTRY_CODE_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid ${fieldName} "${value}" for shipping profile seed ${seedKey}: expected an uppercase ISO 3166-1 alpha-2 code`,
    );
  }

  return trimmed;
}

function parseOptionalBoolean(value: string, fieldName: string, seedKey: string): boolean {
  const trimmed = value.trim().toLowerCase();

  if (trimmed === '' || trimmed === 'false') {
    return false;
  }

  if (trimmed === 'true') {
    return true;
  }

  throw new Error(`Invalid ${fieldName} "${value}" for shipping profile seed ${seedKey}`);
}

function parseStatus(value: string, seedKey: string): ShippingProfileStatus {
  const trimmed = value.trim().toLowerCase();

  if (trimmed === '') {
    return ShippingProfileStatus.DRAFT;
  }

  if (!Object.values(ShippingProfileStatus).includes(trimmed as ShippingProfileStatus)) {
    throw new Error(`Invalid status "${value}" for shipping profile seed ${seedKey}`);
  }

  return trimmed as ShippingProfileStatus;
}

/**
 * Both bounds are stored together or not at all: the database check constraint
 * rejects a half-configured range, and a half-configured seed row is a mistake,
 * never a zero-day estimate.
 */
function parseDurationRange(
  minValue: string,
  maxValue: string,
  fieldName: string,
  seedKey: string,
): { minDays?: number; maxDays?: number } {
  const minDays = parseOptionalInteger(minValue, `${fieldName}_min_days`, seedKey);
  const maxDays = parseOptionalInteger(maxValue, `${fieldName}_max_days`, seedKey);

  if ((minDays === undefined) !== (maxDays === undefined)) {
    throw new Error(`Incomplete ${fieldName} range for shipping profile seed ${seedKey}`);
  }

  if (minDays !== undefined && maxDays !== undefined && minDays > maxDays) {
    throw new Error(
      `Inverted ${fieldName} range ${minDays}-${maxDays} for shipping profile seed ${seedKey}`,
    );
  }

  return { minDays, maxDays };
}

function parseDestinationScope(value: unknown, rateKey: string): ShippingDestinationScope {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!Object.values(ShippingDestinationScope).includes(trimmed as ShippingDestinationScope)) {
    throw new Error(`Invalid destination_scope "${String(value)}" for shipping profile seed ${rateKey}`);
  }

  return trimmed as ShippingDestinationScope;
}

function readRateInteger(value: unknown, fieldName: string, rateKey: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${fieldName} "${String(value)}" for shipping profile seed ${rateKey}`);
  }

  return value;
}

function readOptionalRateInteger(
  value: unknown,
  fieldName: string,
  rateKey: string,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRateInteger(value, fieldName, rateKey);
}

function parseRates(value: string, seedKey: string): ShippingProfileRateSeed[] {
  const trimmed = value.trim();
  if (trimmed === '') {
    return [];
  }

  let rawRates: unknown;
  try {
    rawRates = JSON.parse(trimmed);
  }
  catch (error) {
    throw new Error(
      `Invalid rates_json for shipping profile seed ${seedKey}: ${(error as Error).message}`,
    );
  }

  if (!Array.isArray(rawRates)) {
    throw new Error(`rates_json must be an array for shipping profile seed ${seedKey}`);
  }

  const seenDestinations = new Set<string>();

  return rawRates.map((rawRate, index) => {
    const rateKey = `${seedKey} rates_json[${index}]`;

    if (!rawRate || typeof rawRate !== 'object' || Array.isArray(rawRate)) {
      throw new Error(`Invalid rate at index ${index} for shipping profile seed ${seedKey}`);
    }

    const rate = rawRate as Record<string, unknown>;
    const destinationScope = parseDestinationScope(rate.destination_scope, rateKey);
    const destinationCountry = parseOptionalCountry(
      typeof rate.destination_country === 'string' ? rate.destination_country : '',
      'destination_country',
      rateKey,
    );

    if (destinationScope === ShippingDestinationScope.COUNTRY && !destinationCountry) {
      throw new Error(`Missing destination_country for shipping profile seed ${rateKey}`);
    }

    if (destinationScope === ShippingDestinationScope.EVERYWHERE_ELSE && destinationCountry) {
      throw new Error(
        `destination_country is not allowed for an everywhere_else rate in shipping profile seed ${rateKey}`,
      );
    }

    const destinationKey = `${destinationScope}::${destinationCountry ?? ''}`;
    if (seenDestinations.has(destinationKey)) {
      throw new Error(
        `Duplicate ${destinationScope} destination in shipping profile seed ${seedKey}: ${destinationCountry ?? 'everywhere_else'}`,
      );
    }
    seenDestinations.add(destinationKey);

    const deliveryTimeMinDays = readOptionalRateInteger(
      rate.delivery_time_min_days,
      'delivery_time_min_days',
      rateKey,
    );
    const deliveryTimeMaxDays = readOptionalRateInteger(
      rate.delivery_time_max_days,
      'delivery_time_max_days',
      rateKey,
    );

    if ((deliveryTimeMinDays === undefined) !== (deliveryTimeMaxDays === undefined)) {
      throw new Error(`Incomplete delivery_time range for shipping profile seed ${rateKey}`);
    }

    if (
      deliveryTimeMinDays !== undefined
      && deliveryTimeMaxDays !== undefined
      && deliveryTimeMinDays > deliveryTimeMaxDays
    ) {
      throw new Error(
        `Inverted delivery_time range ${deliveryTimeMinDays}-${deliveryTimeMaxDays} for shipping profile seed ${rateKey}`,
      );
    }

    return {
      destinationScope,
      destinationCountry,
      oneItemFeeMinor: readRateInteger(
        rate.one_item_fee_minor,
        'one_item_fee_minor',
        rateKey,
      ),
      additionalItemFeeMinor: readRateInteger(
        rate.additional_item_fee_minor,
        'additional_item_fee_minor',
        rateKey,
      ),
      deliveryTimeMinDays,
      deliveryTimeMaxDays,
    };
  });
}

function buildShippingProfileSeed(row: ShippingProfileCsvRow, seedKey: string): ShippingProfileSeed {
  const shopSlug = row.shop_slug.trim();
  if (!shopSlug) {
    throw new Error(`Missing shop_slug for shipping profile seed ${seedKey}`);
  }

  const name = row.name.trim();
  if (!name) {
    throw new Error(`Missing name for shipping profile seed ${seedKey}`);
  }

  if (name.length > SHIPPING_PROFILE_NAME_MAX_LENGTH) {
    throw new Error(
      `name longer than ${SHIPPING_PROFILE_NAME_MAX_LENGTH} characters for shipping profile seed ${seedKey}`,
    );
  }

  const shipFromPostal = row.ship_from_postal.trim();
  if (shipFromPostal.length > SHIPPING_PROFILE_POSTAL_MAX_LENGTH) {
    throw new Error(
      `ship_from_postal longer than ${SHIPPING_PROFILE_POSTAL_MAX_LENGTH} characters for shipping profile seed ${seedKey}`,
    );
  }

  const { minDays: processingTimeMinDays, maxDays: processingTimeMaxDays } = parseDurationRange(
    row.processing_time_min_days,
    row.processing_time_max_days,
    'processing_time',
    seedKey,
  );

  const seed: ShippingProfileSeed = {
    shopSlug,
    name,
    normalizedName: name.toLowerCase(),
    status: parseStatus(row.status, seedKey),
    isDefault: parseOptionalBoolean(row.is_default, 'is_default', seedKey),
    shipFromCountry: parseOptionalCountry(row.ship_from_country, 'ship_from_country', seedKey),
    shipFromPostal: shipFromPostal || undefined,
    processingTimeMinDays,
    processingTimeMaxDays,
    rates: parseRates(row.rates_json, seedKey),
  };

  // The shop-wide default is only meaningful for a profile that can price a
  // checkout, so a designated seed row is held to the same readiness rule the
  // runtime set-default path enforces.
  if (seed.isDefault) {
    const issues = collectShippingProfileReadinessIssues(seed);

    if (issues.length > 0) {
      throw new Error(
        `is_default shipping profile is not checkout ready for shipping profile seed ${seedKey}: ${issues.join(', ')}`,
      );
    }
  }

  return seed;
}

function buildShippingProfileSeedKey(seed: ShippingProfileSeed): string {
  return `${seed.shopSlug}::${seed.normalizedName}`;
}

function parseShippingProfileFile(
  filePath: string,
  rows: ShippingProfileCsvRow[],
): ShippingProfileSeed[] {
  const seenSeedKeys = new Set<string>();

  return rows.map((row, index) => {
    const seed = buildShippingProfileSeed(row, `${path.basename(filePath)} row ${index + 2}`);
    const seedKey = buildShippingProfileSeedKey(seed);

    if (seenSeedKeys.has(seedKey)) {
      throw new Error(
        `Duplicate shipping profile "${seed.name}" for shop "${seed.shopSlug}" in ${path.basename(filePath)}`,
      );
    }

    seenSeedKeys.add(seedKey);
    return seed;
  });
}

/**
 * Shared rows load first, local-only rows second, so a local row with the same
 * shop slug and profile name replaces the shared row, rates included. Both
 * files keep file order otherwise, and that order decides which profile a
 * Product is assigned.
 */
function loadShippingProfileSeeds(): ShippingProfileSeed[] {
  const seedsByKey = new Map<string, ShippingProfileSeed>();

  const sharedSeeds = parseShippingProfileFile(
    SHIPPING_PROFILES_TSV_PATH,
    readTsvRows<ShippingProfileCsvRow>(SHIPPING_PROFILES_TSV_PATH),
  );
  const localSeeds = parseShippingProfileFile(
    SHIPPING_PROFILES_LOCAL_TSV_PATH,
    readOptionalTsvRows<ShippingProfileCsvRow>(SHIPPING_PROFILES_LOCAL_TSV_PATH),
  );

  for (const seed of sharedSeeds) {
    seedsByKey.set(buildShippingProfileSeedKey(seed), seed);
  }

  for (const seed of localSeeds) {
    seedsByKey.set(buildShippingProfileSeedKey(seed), seed);
  }

  return [...seedsByKey.values()];
}

export const shippingProfileSeeds: ShippingProfileSeed[] = loadShippingProfileSeeds();
