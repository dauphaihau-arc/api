import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { LocationReferenceRepository } from '../app/ports/location-reference.repository';
import type {
  CountryAddressRuleOverride,
  LocationAdministrativeArea,
  LocationCountry,
  LocationDatasetVersion,
} from '../app/location.types';

type DatasetVersionRow = {
  version: string;
  checksum: string;
};

type CountryRow = {
  code: string;
  name: string;
  has_administrative_areas: boolean;
  postal_code_required: boolean;
};

type AdministrativeAreaRow = {
  code: string;
  name: string;
};

@Injectable()
export class MikroOrmLocationReferenceRepository
implements LocationReferenceRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findCurrentDatasetVersion(): Promise<LocationDatasetVersion | null> {
    const rows = await this.entityManager.getConnection().execute<
      DatasetVersionRow[]
    >(
      `
        select version, checksum
        from location_dataset_versions
        where is_current = true
        limit 1
      `,
    );

    return rows[0] ?? null;
  }

  async findActiveCountries(): Promise<LocationCountry[]> {
    const rows = await this.entityManager.getConnection().execute<CountryRow[]>(
      `
        select
          country.code,
          country.name,
          country.postal_code_required,
          exists (
            select 1
            from location_administrative_areas area
            where area.country_code = country.code
              and area.is_active = true
          ) as has_administrative_areas
        from location_countries country
        where country.is_active = true
        order by country.name asc, country.code asc
      `,
    );

    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      hasAdministrativeAreas: row.has_administrative_areas,
      postalCodeRequired: row.postal_code_required,
    }));
  }

  async findActiveCountry(
    countryCode: string,
  ): Promise<LocationCountry | null> {
    const rows = await this.entityManager.getConnection().execute<CountryRow[]>(
      `
        select
          country.code,
          country.name,
          country.postal_code_required,
          exists (
            select 1
            from location_administrative_areas area
            where area.country_code = country.code
              and area.is_active = true
          ) as has_administrative_areas
        from location_countries country
        where country.code = ?
          and country.is_active = true
        limit 1
      `,
      [countryCode],
    );

    const row = rows[0];

    return row
      ? {
        code: row.code,
        name: row.name,
        hasAdministrativeAreas: row.has_administrative_areas,
        postalCodeRequired: row.postal_code_required,
      }
      : null;
  }

  async findAddressRuleOverride(
    countryCode: string,
  ): Promise<CountryAddressRuleOverride | null> {
    const rows = await this.entityManager.getConnection().execute<
      Array<{ rules: CountryAddressRuleOverride }>
    >(
      `
        select rules
        from country_address_rules
        where country_code = ?
        limit 1
      `,
      [countryCode],
    );

    return rows[0]?.rules ?? null;
  }

  async findActiveAdministrativeAreas(
    countryCode: string,
  ): Promise<LocationAdministrativeArea[] | null> {
    const countries = await this.entityManager.getConnection().execute<
      Array<{ code: string }>
    >(
      `
        select code
        from location_countries
        where code = ?
          and is_active = true
        limit 1
      `,
      [countryCode],
    );

    if (countries.length === 0) {
      return null;
    }

    const rows = await this.entityManager.getConnection().execute<
      AdministrativeAreaRow[]
    >(
      `
        select code, name
        from location_administrative_areas
        where country_code = ?
          and is_active = true
        order by name asc, code asc
      `,
      [countryCode],
    );

    return rows.map((row) => ({ code: row.code, name: row.name }));
  }
}
