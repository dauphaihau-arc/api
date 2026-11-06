import type {
  LocationAdministrativeArea,
  LocationCountry,
  LocationDatasetVersion,
} from '../location.types';

export abstract class LocationReferenceRepository {
  /** The dataset version currently serving public reads, or null when none exists. */
  abstract findCurrentDatasetVersion(): Promise<LocationDatasetVersion | null>;

  /** Active countries sorted by name, with active administrative-area availability. */
  abstract findActiveCountries(): Promise<LocationCountry[]>;

  /**
   * Active administrative areas for an active country, sorted by name.
   * Returns null when the country is unknown or inactive.
   */
  abstract findActiveAdministrativeAreas(
    countryCode: string,
  ): Promise<LocationAdministrativeArea[] | null>;
}
