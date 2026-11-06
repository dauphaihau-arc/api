import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  LocationAdministrativeArea,
  LocationCountry,
} from '~/domains/location/app/location.types';
import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import { MikroOrmLocationReferenceRepository } from '~/domains/location/infra/mikro-orm-location-reference.repository';
import { resolveCountryCode } from '~/shared/utils/country-code';

/**
 * One-off backfill for saved addresses created before canonical location codes
 * existed. It is intentionally not a schema migration: the expand migration
 * ships first, this runs against live data, and the web cutover follows.
 *
 * Rules:
 * - Country text resolves through the shared country resolver/aliases and the
 *   active country reference rows. Unknown countries keep their text.
 * - Subdivision text resolves by case- and accent-insensitive name or code
 *   within the resolved country. Only a unique match is applied; zero or
 *   multiple matches keep the original text with a null code.
 * - Legacy `country`/`state` columns always track the display value that the
 *   address list and edit form read back.
 * - Re-running the command never changes rows that already hold final data.
 */

export interface UserAddressLocationBackfillCountryReport {
  matched: number;
  unmatched: number;
}

export interface UserAddressLocationBackfillSubdivisionReport {
  matched: number;
  ambiguous: number;
  unmatched: number;
}

export interface UserAddressLocationBackfillReport {
  scanned: number;
  updated: number;
  unchanged: number;
  countries: UserAddressLocationBackfillCountryReport;
  subdivisions: UserAddressLocationBackfillSubdivisionReport;
}

export interface BackfillUserAddressLocationsOptions {
  batchSize?: number;
  /** Override the reference repository (both production and tests use active rows). */
  locationRepository?: LocationReferenceRepository;
}

type LegacyAddressRow = {
  id: string;
  country: string | null;
  state: string | null;
  country_code: string | null;
  state_code: string | null;
  country_text: string | null;
  state_text: string | null;
};

type DesiredLocation = {
  country: string;
  countryCode: string | null;
  countryText: string | null;
  state: string;
  stateCode: string | null;
  stateText: string | null;
};

const DEFAULT_BATCH_SIZE = 500;

function normalizeComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function trimmed(value: string | null): string {
  return value?.trim() ?? '';
}

function textOrNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

function sameLocation(
  row: LegacyAddressRow,
  desired: DesiredLocation,
): boolean {
  return (row.country ?? '') === (desired.country ?? '')
    && (row.country_code ?? '') === (desired.countryCode ?? '')
    && (row.country_text ?? '') === (desired.countryText ?? '')
    && (row.state ?? '') === (desired.state ?? '')
    && (row.state_code ?? '') === (desired.stateCode ?? '')
    && (row.state_text ?? '') === (desired.stateText ?? '');
}

function findActiveCountry(
  countriesByCode: Map<string, LocationCountry>,
  countriesByName: Map<string, LocationCountry[]>,
  rawCountry: string,
): LocationCountry | undefined {
  const resolvedCode = resolveCountryCode(rawCountry);
  const byCode = countriesByCode.get(resolvedCode);

  if (byCode) {
    return byCode;
  }

  // The shared resolver relies on CLDR display names and aliases. Dataset
  // names can differ by diacritics or punctuation, so match active names after
  // the same normalization used for subdivisions, accepting only a unique hit.
  const byName = countriesByName.get(normalizeComparable(rawCountry)) ?? [];
  return byName.length === 1 ? byName[0] : undefined;
}

function findUniqueArea(
  areas: LocationAdministrativeArea[],
  rawSubdivision: string,
): { area?: LocationAdministrativeArea; ambiguous: boolean } {
  const comparable = normalizeComparable(rawSubdivision);
  const matches = new Map<string, LocationAdministrativeArea>();

  for (const area of areas) {
    if (
      normalizeComparable(area.name) === comparable
      || normalizeComparable(area.code) === comparable
    ) {
      matches.set(area.code, area);
    }
  }

  if (matches.size === 1) {
    return { area: [...matches.values()][0], ambiguous: false };
  }

  return { ambiguous: matches.size > 1 };
}

export function formatUserAddressLocationBackfillReport(
  report: UserAddressLocationBackfillReport,
): string {
  return [
    `Scanned ${report.scanned} saved addresses: ${report.updated} updated, ${report.unchanged} unchanged`,
    `Countries: ${report.countries.matched} matched, ${report.countries.unmatched} unmatched`,
    `Subdivisions: ${report.subdivisions.matched} matched, ${report.subdivisions.ambiguous} ambiguous, ${report.subdivisions.unmatched} unmatched`,
  ].join('\n');
}

/**
 * Resolves every legacy address (`country_code is null`) in idempotent batches.
 * Only infrastructure/database errors reject; unmatched or ambiguous data is a
 * normal, reported outcome.
 */
export async function backfillUserAddressLocations(
  entityManager: EntityManager,
  options: BackfillUserAddressLocationsOptions = {},
): Promise<UserAddressLocationBackfillReport> {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const connection = entityManager.getConnection();

  const repository = options.locationRepository ??
    new MikroOrmLocationReferenceRepository(entityManager);

  const countries = await repository.findActiveCountries();
  const countriesByCode = new Map(
    countries.map((country) => [country.code, country]),
  );
  const countriesByName = new Map<string, LocationCountry[]>();

  for (const country of countries) {
    const key = normalizeComparable(country.name);
    const current = countriesByName.get(key) ?? [];
    current.push(country);
    countriesByName.set(key, current);
  }

  const areasByCountry = new Map<string, LocationAdministrativeArea[]>();

  const loadAreas = async (
    countryCode: string,
  ): Promise<LocationAdministrativeArea[]> => {
    const cached = areasByCountry.get(countryCode);

    if (cached) {
      return cached;
    }

    const areas = (await repository.findActiveAdministrativeAreas(countryCode)) ??
      [];
    areasByCountry.set(countryCode, areas);

    return areas;
  };

  const report: UserAddressLocationBackfillReport = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    countries: { matched: 0, unmatched: 0 },
    subdivisions: { matched: 0, ambiguous: 0, unmatched: 0 },
  };

  let lastId: string | null = null;

  for (;;) {
    const rows = lastId === null
      ? await connection.execute<LegacyAddressRow[]>(
        `
          select id, country, state, country_code, state_code, country_text, state_text
          from user_addresses
          where country_code is null
          order by id asc
          limit ?
        `,
        [batchSize],
      )
      : await connection.execute<LegacyAddressRow[]>(
        `
          select id, country, state, country_code, state_code, country_text, state_text
          from user_addresses
          where country_code is null
            and id > ?::uuid
          order by id asc
          limit ?
        `,
        [lastId, batchSize],
      );

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      report.scanned += 1;

      const rawCountry = trimmed(row.country);
      const rawSubdivision = trimmed(row.state)
        || trimmed(row.state_code)
        || trimmed(row.state_text);
      const displayState = trimmed(row.state) || trimmed(row.state_text);
      const country = findActiveCountry(
        countriesByCode,
        countriesByName,
        rawCountry,
      );

      let desired: DesiredLocation;

      if (!country) {
        report.countries.unmatched += 1;

        if (rawSubdivision.length > 0) {
          report.subdivisions.unmatched += 1;
        }

        desired = {
          country: rawCountry,
          countryCode: null,
          countryText: textOrNull(rawCountry),
          state: displayState,
          stateCode: null,
          stateText: textOrNull(displayState),
        };
      }
      else {
        report.countries.matched += 1;

        const areas = await loadAreas(country.code);
        const existingStateText = trimmed(row.state)
          || trimmed(row.state_text)
          || rawSubdivision;

        if (areas.length === 0) {
          desired = {
            country: country.name,
            countryCode: country.code,
            countryText: null,
            state: displayState,
            stateCode: null,
            stateText: textOrNull(displayState),
          };
        }
        else if (rawSubdivision.length === 0) {
          desired = {
            country: country.name,
            countryCode: country.code,
            countryText: null,
            state: trimmed(row.state),
            stateCode: null,
            stateText: null,
          };
        }
        else {
          const { area, ambiguous } = findUniqueArea(areas, rawSubdivision);

          if (area) {
            report.subdivisions.matched += 1;
            desired = {
              country: country.name,
              countryCode: country.code,
              countryText: null,
              state: area.name,
              stateCode: area.code,
              stateText: null,
            };
          }
          else {
            if (ambiguous) {
              report.subdivisions.ambiguous += 1;
            }
            else {
              report.subdivisions.unmatched += 1;
            }

            desired = {
              country: country.name,
              countryCode: country.code,
              countryText: null,
              state: existingStateText,
              stateCode: null,
              stateText: textOrNull(existingStateText),
            };
          }
        }
      }

      if (sameLocation(row, desired)) {
        report.unchanged += 1;
      }
      else {
        await connection.execute(
          `
            update user_addresses
            set country = ?,
                country_code = ?,
                country_text = ?,
                state = ?,
                state_code = ?,
                state_text = ?,
                updated_at = now()
            where id = ?::uuid
          `,
          [
            desired.country,
            desired.countryCode,
            desired.countryText,
            desired.state,
            desired.stateCode,
            desired.stateText,
            row.id,
          ],
        );
        report.updated += 1;
      }
    }

    const lastRow = rows.at(-1);

    if (!lastRow) {
      break;
    }

    lastId = lastRow.id;
  }

  return report;
}
