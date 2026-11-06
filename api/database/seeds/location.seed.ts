import type { EntityManager } from '@mikro-orm/postgresql';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { CountryAddressRuleEntity } from '~/domains/location/infra/persistence/entities/country-address-rule.entity';
import { LocationAdministrativeAreaEntity } from '~/domains/location/infra/persistence/entities/location-administrative-area.entity';
import { LocationCountryEntity } from '~/domains/location/infra/persistence/entities/location-country.entity';
import { LocationDatasetVersionEntity } from '~/domains/location/infra/persistence/entities/location-dataset-version.entity';
import type {
  AddressRuleFieldKey,
  CountryAddressRuleOverride,
} from '~/domains/location/app/location.types';

const REFERENCE_DIR = path.resolve(__dirname, '../reference/locations');

const COUNTRY_FILE = 'countries.json';
const ADMINISTRATIVE_AREA_FILE = 'administrative-areas.json';
const POSTAL_CODE_REQUIREDNESS_FILE = 'postal-code-requiredness.json';
const ADDRESS_RULE_OVERRIDES_FILE = 'address-rule-overrides.json';

const CHECKSUM_FILES = [
  COUNTRY_FILE,
  ADMINISTRATIVE_AREA_FILE,
  POSTAL_CODE_REQUIREDNESS_FILE,
  ADDRESS_RULE_OVERRIDES_FILE,
] as const;

const ADDRESS_RULE_FIELD_KEYS: Partial<Record<AddressRuleFieldKey, true>> = {
  full_name: true,
  address_1: true,
  address_2: true,
  city: true,
  subdivision: true,
  zip: true,
  phone: true,
};

const HIDEABLE_ADDRESS_RULE_FIELDS: Partial<Record<AddressRuleFieldKey, true>> = {
  subdivision: true,
  zip: true,
};

const EXPECTED_COUNTRY_COUNT = 250;
const EXPECTED_ADMINISTRATIVE_AREA_COUNT = 3_863;
const EXPECTED_VIETNAM_ADMINISTRATIVE_AREA_COUNT = 34;

export const LOCATION_DATASET_VERSION = 'dr5hn-v5.2.0-export.1+vn-54cdb052';
export const LOCATION_DATASET_SOURCE =
  'dr5hn/countries-states-cities-database@9b255c45 + open-admin-data/vietnam-administrative-divisions@54cdb052';

type CountrySeedRow = {
  code: string;
  name: string;
};

type AdministrativeAreaSeedRow = {
  code: string;
  country_code: string;
  name: string;
  type?: string | null;
};

type PostalCodeRequiredness = Record<string, boolean>;

type AddressRuleOverrideSeedRow = {
  country_code: string;
  rules: CountryAddressRuleOverride;
};

export type LocationCountrySeed = {
  code: string;
  name: string;
  postalCodeRequired: boolean;
};

export type LocationAdministrativeAreaSeed = {
  code: string;
  countryCode: string;
  name: string;
  type?: string;
};

export type LocationSeedDataset = {
  countries: LocationCountrySeed[];
  administrativeAreas: LocationAdministrativeAreaSeed[];
  addressRuleOverrides: LocationAddressRuleOverrideSeed[];
  countryCodes: Set<string>;
  checksum: string;
};

export type LocationAddressRuleOverrideSeed = {
  countryCode: string;
  rules: CountryAddressRuleOverride;
};

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function readReferenceJson<T>(fileName: string): T {
  return JSON.parse(
    readFileSync(path.join(REFERENCE_DIR, fileName), 'utf8'),
  ) as T;
}

function computeDatasetChecksum(): string {
  const hash = createHash('sha256');

  for (const fileName of CHECKSUM_FILES) {
    hash.update(readFileSync(path.join(REFERENCE_DIR, fileName)));
  }

  return hash.digest('hex');
}

function assertUniqueCodes(
  rows: readonly { code: string }[],
  label: string,
): void {
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.code)) {
      throw new Error(`[seed][locations] Duplicate ${label} code "${row.code}"`);
    }

    seen.add(row.code);
  }
}

function assertValidAddressRuleOverrides(
  rows: readonly AddressRuleOverrideSeedRow[],
  countryCodes: ReadonlySet<string>,
): LocationAddressRuleOverrideSeed[] {
  const seen = new Set<string>();
  const overrides: LocationAddressRuleOverrideSeed[] = [];

  for (const row of rows) {
    if (!/^[A-Z]{2}$/.test(row.country_code)) {
      throw new Error(
        `[seed][locations] Invalid address rule override country code "${row.country_code}"`,
      );
    }

    if (seen.has(row.country_code)) {
      throw new Error(
        `[seed][locations] Duplicate address rule override for "${row.country_code}"`,
      );
    }

    if (!countryCodes.has(row.country_code)) {
      throw new Error(
        `[seed][locations] Address rule override references unknown country ${row.country_code}`,
      );
    }

    const rules = row.rules;
    const unknownKey = Object.keys(rules).find(
      (key) => key !== 'order' && key !== 'labels' && key !== 'hidden',
    );

    if (unknownKey) {
      throw new Error(
        `[seed][locations] Address rule override ${row.country_code} has unsupported key "${unknownKey}"`,
      );
    }

    for (const field of rules.order ?? []) {
      if (ADDRESS_RULE_FIELD_KEYS[field] !== true) {
        throw new Error(
          `[seed][locations] Address rule override ${row.country_code} orders unknown field "${field}"`,
        );
      }
    }

    for (const [field, label] of Object.entries(rules.labels ?? {})) {
      if (ADDRESS_RULE_FIELD_KEYS[field as AddressRuleFieldKey] !== true) {
        throw new Error(
          `[seed][locations] Address rule override ${row.country_code} labels unknown field "${field}"`,
        );
      }

      if (!label.trim()) {
        throw new Error(
          `[seed][locations] Address rule override ${row.country_code} has an empty label for "${field}"`,
        );
      }
    }

    for (const field of rules.hidden ?? []) {
      if (HIDEABLE_ADDRESS_RULE_FIELDS[field] !== true) {
        throw new Error(
          `[seed][locations] Address rule override ${row.country_code} cannot hide field "${field}"`,
        );
      }
    }

    seen.add(row.country_code);
    overrides.push({ countryCode: row.country_code, rules });
  }

  return overrides;
}

export function loadLocationDataset(): LocationSeedDataset {
  const countries = readReferenceJson<CountrySeedRow[]>(COUNTRY_FILE);
  const administrativeAreas = readReferenceJson<AdministrativeAreaSeedRow[]>(
    ADMINISTRATIVE_AREA_FILE,
  );
  const postalCodeRequiredness = readReferenceJson<PostalCodeRequiredness>(
    POSTAL_CODE_REQUIREDNESS_FILE,
  );
  const addressRuleOverrides = readReferenceJson<AddressRuleOverrideSeedRow[]>(
    ADDRESS_RULE_OVERRIDES_FILE,
  );

  if (countries.length !== EXPECTED_COUNTRY_COUNT) {
    throw new Error(
      `[seed][locations] Expected ${EXPECTED_COUNTRY_COUNT} countries, found ${countries.length}`,
    );
  }

  if (administrativeAreas.length !== EXPECTED_ADMINISTRATIVE_AREA_COUNT) {
    throw new Error(
      `[seed][locations] Expected ${EXPECTED_ADMINISTRATIVE_AREA_COUNT} administrative areas, found ${administrativeAreas.length}`,
    );
  }

  assertUniqueCodes(countries, 'country');
  assertUniqueCodes(administrativeAreas, 'administrative area');

  const countryCodes = new Set<string>();

  for (const country of countries) {
    if (!/^[A-Z]{2}$/.test(country.code)) {
      throw new Error(
        `[seed][locations] Invalid country code "${country.code}"`,
      );
    }

    if (!country.name.trim()) {
      throw new Error(`[seed][locations] Country ${country.code} has no name`);
    }

    countryCodes.add(country.code);
  }

  for (const area of administrativeAreas) {
    if (!area.code.trim() || area.code.length > 16) {
      throw new Error(
        `[seed][locations] Invalid administrative area code "${area.code}"`,
      );
    }

    if (!countryCodes.has(area.country_code)) {
      throw new Error(
        `[seed][locations] Administrative area ${area.code} references unknown country ${area.country_code}`,
      );
    }

    if (!area.name.trim()) {
      throw new Error(
        `[seed][locations] Administrative area ${area.code} has no name`,
      );
    }
  }

  const vietnamAreas = administrativeAreas.filter(
    (area) => area.country_code === 'VN',
  );

  if (vietnamAreas.length !== EXPECTED_VIETNAM_ADMINISTRATIVE_AREA_COUNT) {
    throw new Error(
      `[seed][locations] Expected ${EXPECTED_VIETNAM_ADMINISTRATIVE_AREA_COUNT} Vietnam administrative areas, found ${vietnamAreas.length}`,
    );
  }

  if (!vietnamAreas.some((area) => area.code === 'VN-01')) {
    throw new Error(
      '[seed][locations] Vietnam override is missing the VN-01 Hanoi area',
    );
  }

  return {
    countries: countries.map((country) => ({
      code: country.code,
      name: country.name,
      // Missing metadata follows libaddressinput's ZZ default, whose
      // `require` string does not include a postal code.
      postalCodeRequired: postalCodeRequiredness[country.code] ?? false,
    })),
    administrativeAreas: administrativeAreas.map((area) => ({
      code: area.code,
      countryCode: area.country_code,
      name: area.name,
      type: area.type ?? undefined,
    })),
    addressRuleOverrides: assertValidAddressRuleOverrides(
      addressRuleOverrides,
      countryCodes,
    ),
    countryCodes,
    checksum: computeDatasetChecksum(),
  };
}

/**
 * Upserts the committed Location reference data by code, deactivates rows the
 * dataset no longer contains, and records a dataset version. Removed rows stay
 * in the database so historical references remain resolvable.
 *
 * The version row is written in the data transaction but only marked current
 * after that transaction commits, so readers never see a half-imported
 * dataset.
 */
export async function seedLocations(em: EntityManager): Promise<void> {
  const dataset = loadLocationDataset();
  const startedAt = Date.now();
  const countryProgressInterval = resolveProgressInterval(dataset.countries.length);
  const areaProgressInterval = resolveProgressInterval(
    dataset.administrativeAreas.length,
  );

  console.log(
    `[seed][locations] Upserting ${dataset.countries.length} countries and ${dataset.administrativeAreas.length} administrative areas from ${LOCATION_DATASET_VERSION}`,
  );

  const versionId = await em.transactional(async (transactionalEm) => {
    const existingCountries = await transactionalEm.find(
      LocationCountryEntity,
      {},
    );
    const countriesByCode = new Map(
      existingCountries.map((country) => [country.code, country]),
    );

    for (const [index, seed] of dataset.countries.entries()) {
      const existing = countriesByCode.get(seed.code);

      if (existing) {
        existing.name = seed.name;
        existing.postalCodeRequired = seed.postalCodeRequired;
        existing.isActive = true;
      }
      else {
        const country = transactionalEm.create(LocationCountryEntity, {
          code: seed.code,
          name: seed.name,
          postalCodeRequired: seed.postalCodeRequired,
          isActive: true,
        });
        countriesByCode.set(seed.code, country);
        transactionalEm.persist(country);
      }

      if (
        (index + 1) % countryProgressInterval === 0
        || index + 1 === dataset.countries.length
      ) {
        console.log(
          `[seed][locations] Upserted ${index + 1}/${dataset.countries.length} countries in ${formatDuration(Date.now() - startedAt)}`,
        );
      }
    }

    let deactivatedCountryCount = 0;

    for (const country of existingCountries) {
      if (!dataset.countryCodes.has(country.code) && country.isActive) {
        country.isActive = false;
        deactivatedCountryCount += 1;
      }
    }

    const existingAreas = await transactionalEm.find(
      LocationAdministrativeAreaEntity,
      {},
    );
    const areasByCode = new Map(
      existingAreas.map((area) => [area.code, area]),
    );
    const seededAreaCodes = new Set<string>();

    for (const [index, seed] of dataset.administrativeAreas.entries()) {
      seededAreaCodes.add(seed.code);

      const country = countriesByCode.get(seed.countryCode);

      if (!country) {
        throw new Error(
          `[seed][locations] Administrative area ${seed.code} references unseeded country ${seed.countryCode}`,
        );
      }

      const existing = areasByCode.get(seed.code);

      if (existing) {
        existing.name = seed.name;
        existing.type = seed.type;
        existing.country = country;
        existing.isActive = true;
      }
      else {
        const area = transactionalEm.create(LocationAdministrativeAreaEntity, {
          code: seed.code,
          country,
          name: seed.name,
          type: seed.type,
          isActive: true,
        });
        areasByCode.set(seed.code, area);
        transactionalEm.persist(area);
      }

      if (
        (index + 1) % areaProgressInterval === 0
        || index + 1 === dataset.administrativeAreas.length
      ) {
        console.log(
          `[seed][locations] Upserted ${index + 1}/${dataset.administrativeAreas.length} administrative areas in ${formatDuration(Date.now() - startedAt)}`,
        );
      }
    }

    let deactivatedAreaCount = 0;

    for (const area of existingAreas) {
      if (!seededAreaCodes.has(area.code) && area.isActive) {
        area.isActive = false;
        deactivatedAreaCount += 1;
      }
    }

    // Countries must exist before override rows reference them, and MikroORM
    // cannot infer that order from the scalar foreign key.
    await transactionalEm.flush();

    const existingRules = await transactionalEm.find(
      CountryAddressRuleEntity,
      {},
    );
    const rulesByCountryCode = new Map(
      existingRules.map((rule) => [rule.countryCode, rule]),
    );
    const seededRuleCountryCodes = new Set<string>();

    for (const seed of dataset.addressRuleOverrides) {
      seededRuleCountryCodes.add(seed.countryCode);

      const existing = rulesByCountryCode.get(seed.countryCode);

      if (existing) {
        existing.rules = seed.rules;
      }
      else {
        transactionalEm.persist(
          transactionalEm.create(CountryAddressRuleEntity, {
            countryCode: seed.countryCode,
            rules: seed.rules,
          }),
        );
      }
    }

    let deletedRuleCount = 0;

    for (const rule of existingRules) {
      if (!seededRuleCountryCodes.has(rule.countryCode)) {
        transactionalEm.remove(rule);
        deletedRuleCount += 1;
      }
    }

    await transactionalEm.flush();

    console.log(
      `[seed][locations] Deactivated ${deactivatedCountryCount} countries and ${deactivatedAreaCount} administrative areas missing from the dataset; upserted ${dataset.addressRuleOverrides.length} address rule overrides and deleted ${deletedRuleCount}`,
    );

    const existingVersion = await transactionalEm.findOne(
      LocationDatasetVersionEntity,
      {
        version: LOCATION_DATASET_VERSION,
        checksum: dataset.checksum,
      },
    );

    const version = existingVersion ??
      transactionalEm.create(LocationDatasetVersionEntity, {
        version: LOCATION_DATASET_VERSION,
        source: LOCATION_DATASET_SOURCE,
        checksum: dataset.checksum,
        importedAt: new Date(),
        isCurrent: false,
      });

    version.source = LOCATION_DATASET_SOURCE;
    version.importedAt = new Date();

    if (!existingVersion) {
      transactionalEm.persist(version);
    }

    await transactionalEm.flush();

    return version.id;
  });

  // Only after the data transaction commits may readers resolve this version.
  await em.transactional(async (transactionalEm) => {
    await transactionalEm.nativeUpdate(
      LocationDatasetVersionEntity,
      { isCurrent: true },
      { isCurrent: false, updatedAt: new Date() },
    );
    await transactionalEm.nativeUpdate(
      LocationDatasetVersionEntity,
      { id: versionId },
      { isCurrent: true, updatedAt: new Date() },
    );
  });

  console.log(
    `[seed][locations] Activated dataset ${LOCATION_DATASET_VERSION} (checksum ${dataset.checksum}) in ${formatDuration(Date.now() - startedAt)}`,
  );
}
