import { Injectable } from '@nestjs/common';
import { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import { CatalogShipToInvalidError } from '../errors/product-app.error';
import { CATALOG_SHIP_TO_ALL } from '../shipping-coverage';

const ISO_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Validates the catalog-only `catalog_ship_to` value against the active
 * location countries. Returns the normalized value (`all`, an uppercase ISO
 * code, or `undefined` when absent) for the list/facet query.
 *
 * Catalog destination selection is a browse filter only; callers keep every
 * other storefront surface on the Market Preview Destination.
 */
@Injectable()
export class CatalogShipToResolver {
  constructor(
    private readonly locationReferenceRepository: LocationReferenceRepository,
  ) {}

  async resolve(catalogShipTo?: string): Promise<string | undefined> {
    const trimmed = catalogShipTo?.trim();

    if (!trimmed) {
      return undefined;
    }

    if (trimmed.toLowerCase() === CATALOG_SHIP_TO_ALL) {
      return CATALOG_SHIP_TO_ALL;
    }

    const countryCode = trimmed.toUpperCase();

    if (!ISO_COUNTRY_CODE_PATTERN.test(countryCode)) {
      throw new CatalogShipToInvalidError(trimmed);
    }

    const country = await this.locationReferenceRepository.findActiveCountry(
      countryCode,
    );

    if (!country) {
      throw new CatalogShipToInvalidError(countryCode);
    }

    return country.code;
  }
}
