import type { EntityManager } from '@mikro-orm/postgresql';
import {
  MARKETPLACE_CURRENCIES,
  MARKETPLACE_LANGUAGES,
  MARKETPLACE_REGIONS,
  type MarketplaceCurrency,
  type MarketplaceLanguage,
  type MarketplaceRegion,
} from '~/platform/config/marketplace.config';
import type { CurrentUserEntity } from '~/domains/auth/infra/persistence/entities/current-user.entity';
import { UserPreferenceEntity } from '~/domains/auth/infra/persistence/entities/user-preference.entity';
import { UserAddressEntity } from '~/domains/user/infra/persistence/entities/user-address.entity';
import {
  USER_ADDRESSES_LOCAL_TSV_PATH,
  USER_ADDRESSES_TSV_PATH,
  USER_PREFERENCES_LOCAL_TSV_PATH,
  USER_PREFERENCES_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

type UserAddressCsvRow = {
  user_email: string;
  full_name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  is_primary: string;
};

type UserPreferenceCsvRow = {
  user_email: string;
  region: string;
  language: string;
  currency: string;
};

type UserAddressSeed = {
  userEmail: string;
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  isPrimary: boolean;
};

type UserPreferenceSeed = {
  userEmail: string;
  region: MarketplaceRegion;
  language: MarketplaceLanguage;
  currency: MarketplaceCurrency;
};

function parseBoolean(value: string, seedKey: string, fieldName: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error(`Invalid ${fieldName} "${value}" for profile seed ${seedKey}`);
}

function parseRegion(value: string, seedKey: string): MarketplaceRegion {
  if (MARKETPLACE_REGIONS.includes(value as MarketplaceRegion)) {
    return value as MarketplaceRegion;
  }

  throw new Error(`Invalid region "${value}" for preference seed ${seedKey}`);
}

function parseLanguage(value: string, seedKey: string): MarketplaceLanguage {
  if (MARKETPLACE_LANGUAGES.includes(value as MarketplaceLanguage)) {
    return value as MarketplaceLanguage;
  }

  throw new Error(`Invalid language "${value}" for preference seed ${seedKey}`);
}

function parseCurrency(value: string, seedKey: string): MarketplaceCurrency {
  if (MARKETPLACE_CURRENCIES.includes(value as MarketplaceCurrency)) {
    return value as MarketplaceCurrency;
  }

  throw new Error(`Invalid currency "${value}" for preference seed ${seedKey}`);
}

function loadUserAddressSeeds(): UserAddressSeed[] {
  return [
    ...readTsvRows<UserAddressCsvRow>(USER_ADDRESSES_TSV_PATH),
    ...readOptionalTsvRows<UserAddressCsvRow>(USER_ADDRESSES_LOCAL_TSV_PATH),
  ].map((row, index) => {
    const seedKey = `${row.user_email || `row-${index + 2}`}`;

    if (!row.user_email.trim()) throw new Error(`Missing user_email for address seed row ${index + 2}`);
    if (!row.full_name.trim()) throw new Error(`Missing full_name for address seed ${seedKey}`);
    if (!row.address1.trim()) throw new Error(`Missing address1 for address seed ${seedKey}`);
    if (!row.city.trim()) throw new Error(`Missing city for address seed ${seedKey}`);
    if (!row.state.trim()) throw new Error(`Missing state for address seed ${seedKey}`);
    if (!row.zip.trim()) throw new Error(`Missing zip for address seed ${seedKey}`);
    if (!row.country.trim()) throw new Error(`Missing country for address seed ${seedKey}`);
    if (!row.phone.trim()) throw new Error(`Missing phone for address seed ${seedKey}`);

    return {
      userEmail: row.user_email.trim(),
      fullName: row.full_name.trim(),
      address1: row.address1.trim(),
      address2: row.address2.trim() || undefined,
      city: row.city.trim(),
      state: row.state.trim(),
      zip: row.zip.trim(),
      country: row.country.trim(),
      phone: row.phone.trim(),
      isPrimary: parseBoolean(row.is_primary, seedKey, 'is_primary'),
    };
  });
}

function loadUserPreferenceSeeds(): UserPreferenceSeed[] {
  return [
    ...readTsvRows<UserPreferenceCsvRow>(USER_PREFERENCES_TSV_PATH),
    ...readOptionalTsvRows<UserPreferenceCsvRow>(USER_PREFERENCES_LOCAL_TSV_PATH),
  ].map((row, index) => {
    const seedKey = `${row.user_email || `row-${index + 2}`}`;

    if (!row.user_email.trim()) throw new Error(`Missing user_email for preference seed row ${index + 2}`);
    if (!row.region.trim()) throw new Error(`Missing region for preference seed ${seedKey}`);
    if (!row.language.trim()) throw new Error(`Missing language for preference seed ${seedKey}`);
    if (!row.currency.trim()) throw new Error(`Missing currency for preference seed ${seedKey}`);

    return {
      userEmail: row.user_email.trim(),
      region: parseRegion(row.region.trim(), seedKey),
      language: parseLanguage(row.language.trim(), seedKey),
      currency: parseCurrency(row.currency.trim(), seedKey),
    };
  });
}

const userAddressSeeds = loadUserAddressSeeds();
const userPreferenceSeeds = loadUserPreferenceSeeds();

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

export async function seedUserProfiles(
  em: EntityManager,
  usersByEmail: Map<string, CurrentUserEntity>,
): Promise<void> {
  const addressSeedsByUserEmail = new Map<string, UserAddressSeed[]>();

  userAddressSeeds.forEach((seed) => {
    const existing = addressSeedsByUserEmail.get(seed.userEmail) ?? [];
    existing.push(seed);
    addressSeedsByUserEmail.set(seed.userEmail, existing);
  });

  const addressGroups = Array.from(addressSeedsByUserEmail.entries());
  const addressProgressInterval = resolveProgressInterval(addressGroups.length);
  const preferenceProgressInterval = resolveProgressInterval(userPreferenceSeeds.length);
  const addressesStartedAt = Date.now();
  const preferenceUsers = userPreferenceSeeds
    .map((seed) => usersByEmail.get(seed.userEmail))
    .filter((user): user is CurrentUserEntity => Boolean(user));
  const existingPreferences = preferenceUsers.length > 0
    ? await em.find(UserPreferenceEntity, { user: { $in: preferenceUsers.map((user) => user.id) } }, { populate: ['user'] })
    : [];
  const existingPreferencesByUserId = new Map(
    existingPreferences.map((preference) => [preference.user.id, preference]),
  );

  console.log(
    `[seed][profiles] Upserting ${userAddressSeeds.length} addresses across ${addressGroups.length} users`,
  );

  for (const [index, [userEmail, seeds]] of addressGroups.entries()) {
    const user = usersByEmail.get(userEmail);

    if (!user) {
      throw new Error(`Missing seeded user for address seed: ${userEmail}`);
    }

    const primaryCount = seeds.filter((seed) => seed.isPrimary).length;

    if (primaryCount > 1) {
      throw new Error(`Multiple primary addresses seeded for user ${userEmail}`);
    }

    await em.nativeDelete(UserAddressEntity, { user: user.id });

    seeds.forEach((seed) => {
      em.persist(em.create(UserAddressEntity, {
        user,
        fullName: seed.fullName,
        address1: seed.address1,
        address2: seed.address2,
        city: seed.city,
        state: seed.state,
        zip: seed.zip,
        country: seed.country,
        phone: seed.phone,
        isPrimary: seed.isPrimary,
      }));
    });

    await em.flush();

    if ((index + 1) % addressProgressInterval === 0 || index + 1 === addressGroups.length) {
      console.log(
        `[seed][profiles] Processed ${index + 1}/${addressGroups.length} address groups in ${formatDuration(Date.now() - addressesStartedAt)}`,
      );
    }
  }

  console.log(`[seed][profiles] Upserting ${userPreferenceSeeds.length} preferences`);
  const preferencesStartedAt = Date.now();

  for (const [index, seed] of userPreferenceSeeds.entries()) {
    const user = usersByEmail.get(seed.userEmail);

    if (!user) {
      throw new Error(`Missing seeded user for preference seed: ${seed.userEmail}`);
    }

    const existingPreference = existingPreferencesByUserId.get(user.id);

    if (!existingPreference) {
      const preference = em.create(UserPreferenceEntity, {
        user,
        region: seed.region,
        language: seed.language,
        currency: seed.currency,
      });
      existingPreferencesByUserId.set(user.id, preference);
      em.persist(preference);
      await em.flush();
      if (
        (index + 1) % preferenceProgressInterval === 0
        || index + 1 === userPreferenceSeeds.length
      ) {
        console.log(
          `[seed][profiles] Processed ${index + 1}/${userPreferenceSeeds.length} preferences in ${formatDuration(Date.now() - preferencesStartedAt)}`,
        );
      }
      continue;
    }

    existingPreference.region = seed.region;
    existingPreference.language = seed.language;
    existingPreference.currency = seed.currency;
    await em.flush();

    if (
      (index + 1) % preferenceProgressInterval === 0
      || index + 1 === userPreferenceSeeds.length
    ) {
      console.log(
        `[seed][profiles] Processed ${index + 1}/${userPreferenceSeeds.length} preferences in ${formatDuration(Date.now() - preferencesStartedAt)}`,
      );
    }
  }
}
