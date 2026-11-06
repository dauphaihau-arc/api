import type {
  CountryAddressRuleOverride,
  LocationAdministrativeArea,
  LocationCountry,
  LocationDatasetVersion,
} from '../location.types';

export abstract class LocationReferenceRepository {
  /** The dataset version currently serving public reads, or null when none exists. */
  abstract findCurrentDatasetVersion(): Promise<LocationDatasetVersion | null>;

  /** Active countries sorted by name, with active administrative-area availability. */
  abstract findActiveCountries(): Promise<LocationCountry[]>;

  /** One active country by code, or null when it is unknown or inactive. */
  abstract findActiveCountry(
    countryCode: string,
  ): Promise<LocationCountry | null>;

  /** The stored Arc address-rule override for a country, or null when it has none. */
  abstract findAddressRuleOverride(
    countryCode: string,
  ): Promise<CountryAddressRuleOverride | null>;

  /**
   * Active administrative areas for an active country, sorted by name.
   * Returns null when the country is unknown or inactive.
   */
  abstract findActiveAdministrativeAreas(
    countryCode: string,
  ): Promise<LocationAdministrativeArea[] | null>;
}
