import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import {
  LocationCountryNotFoundError,
  LocationDatasetUnavailableError,
} from '../../errors/location-app.error';
import type { LocationAdministrativeAreasView } from '../../location.types';
import { LocationReferenceRepository } from '../../ports/location-reference.repository';
import { loadCurrentLocationDataset } from '../shared/load-current-location-dataset';

@Injectable()
export class ListAdministrativeAreasUseCase {
  constructor(
    private readonly locationReferenceRepository: LocationReferenceRepository,
  ) {}

  async execute(
    rawCountryCode: string,
  ): Promise<
    Result<
      LocationAdministrativeAreasView,
      LocationDatasetUnavailableError | LocationCountryNotFoundError
    >
  > {
    const dataset = await loadCurrentLocationDataset(
      this.locationReferenceRepository,
    );

    if (!dataset.isOk) {
      return dataset;
    }

    const countryCode = rawCountryCode.trim().toUpperCase();

    const areas = await this.locationReferenceRepository.findActiveAdministrativeAreas(
      countryCode,
    );

    if (!areas) {
      return err(new LocationCountryNotFoundError(countryCode));
    }

    return ok({
      version: dataset.value.version,
      checksum: dataset.value.checksum,
      areas,
    });
  }
}
