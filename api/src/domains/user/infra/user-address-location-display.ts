import type { EntityManager } from '@mikro-orm/postgresql';

export interface UserAddressLocationDisplay {
  country: string;
  state: string;
}

export interface UserAddressLocationRow {
  countryCode?: string | null;
  stateCode?: string | null;
  countryText?: string | null;
  stateText?: string | null;
}

type CountryNameRow = { code: string; name: string };
type AreaNameRow = { country_code: string; code: string; name: string };

function areaKey(countryCode: string, stateCode: string): string {
  return `${countryCode}:${stateCode}`;
}

/**
 * Batch-resolves readable country and subdivision names for persisted address
 * rows. Codes are authoritative; preserved legacy text wins when a row has no
 * code, and the raw value stays readable if the reference row disappeared.
 * One query per reference table keeps list reads free of N+1 lookups.
 */
export async function loadUserAddressLocationDisplays(
  entityManager: EntityManager,
  rows: readonly UserAddressLocationRow[],
): Promise<(row: UserAddressLocationRow) => UserAddressLocationDisplay> {
  const countryCodes = [
    ...new Set(rows.map((row) => row.countryCode).filter((code): code is string => !!code)),
  ];
  const countryNames = new Map<string, string>();
  const areaNames = new Map<string, string>();
  const connection = entityManager.getConnection();

  if (countryCodes.length > 0) {
    const placeholders = countryCodes.map(() => '?').join(', ');
    const countryRows = await connection.execute<CountryNameRow[]>(
      `select code, name from location_countries where code in (${placeholders})`,
      countryCodes,
    );

    for (const country of countryRows) {
      countryNames.set(country.code, country.name);
    }

    const areaRows = await connection.execute<AreaNameRow[]>(
      `
        select country_code, code, name
        from location_administrative_areas
        where country_code in (${placeholders})
      `,
      countryCodes,
    );

    for (const area of areaRows) {
      areaNames.set(areaKey(area.country_code, area.code), area.name);
    }
  }

  return (row) => {
    const codedCountry = row.countryCode
      ? countryNames.get(row.countryCode) ?? row.countryCode
      : '';
    const codedState = row.countryCode && row.stateCode
      ? areaNames.get(areaKey(row.countryCode, row.stateCode)) ?? row.stateCode
      : '';

    return {
      country: row.countryText ?? codedCountry,
      state: row.stateText ?? codedState,
    };
  };
}
