import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { mergeCountryAddressRules } from '../../address-rules.merge';
import {
  LocationCountryNotFoundError,
  LocationDatasetUnavailableError,
} from '../../errors/location-app.error';
import type { CountryAddressRulesView } from '../../location.types';
import { LocationReferenceRepository } from '../../ports/location-reference.repository';
import { loadCurrentLocationDataset } from '../shared/load-current-location-dataset';

@Injectable()
export class GetCountryAddressRulesUseCase {
  constructor(
    private readonly locationReferenceRepository: LocationReferenceRepository,
  ) {}

  async execute(
    rawCountryCode: string,
  ): Promise<
    Result<
      CountryAddressRulesView,
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

    const country = await this.locationReferenceRepository.findActiveCountry(
      countryCode,
    );

    if (!country) {
      return err(new LocationCountryNotFoundError(countryCode));
    }

    const override =
      await this.locationReferenceRepository.findAddressRuleOverride(
        country.code,
      );

    return ok({
      version: dataset.value.version,
      checksum: dataset.value.checksum,
      rules: mergeCountryAddressRules({
        countryCode: country.code,
        hasAdministrativeAreas: country.hasAdministrativeAreas,
        postalCodeRequired: country.postalCodeRequired,
        override,
      }),
    });
  }
}
