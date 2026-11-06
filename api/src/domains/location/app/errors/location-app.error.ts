import { DomainError } from '~/platform/errors/domain.error';

export abstract class LocationAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

/** No dataset version is marked current, so no reference data can be served. */
export class LocationDatasetUnavailableError extends LocationAppError {
  constructor() {
    super('Location reference dataset is unavailable');
  }
}

/** The requested country is unknown or inactive. */
export class LocationCountryNotFoundError extends LocationAppError {
  constructor(countryCode: string) {
    super(`Location country "${countryCode}" was not found`);
  }
}
