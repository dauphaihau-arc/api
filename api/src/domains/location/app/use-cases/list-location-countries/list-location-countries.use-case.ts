import { Injectable } from '@nestjs/common';
import { ok, type Result } from '~/platform/application/result';
import { LocationDatasetUnavailableError } from '../../errors/location-app.error';
import type { LocationCountriesView } from '../../location.types';
import { LocationReferenceRepository } from '../../ports/location-reference.repository';
import { loadCurrentLocationDataset } from '../shared/load-current-location-dataset';

@Injectable()
export class ListLocationCountriesUseCase {
  constructor(
    private readonly locationReferenceRepository: LocationReferenceRepository,
  ) {}

  async execute(): Promise<
    Result<LocationCountriesView, LocationDatasetUnavailableError>
  > {
    const dataset = await loadCurrentLocationDataset(
      this.locationReferenceRepository,
    );

    if (!dataset.isOk) {
      return dataset;
    }

    const countries = await this.locationReferenceRepository.findActiveCountries();

    return ok({
      version: dataset.value.version,
      checksum: dataset.value.checksum,
      countries,
    });
  }
}
