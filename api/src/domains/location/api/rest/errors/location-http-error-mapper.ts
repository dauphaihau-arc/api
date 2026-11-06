import type { HttpException } from '@nestjs/common';
import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { LocationAppError } from '../../../app/errors/location-app.error';
import {
  LocationCountryNotFoundError,
  LocationDatasetUnavailableError,
} from '../../../app/errors/location-app.error';

export function mapLocationAppErrorToHttpException(
  error: LocationAppError,
): HttpException {
  if (error instanceof LocationDatasetUnavailableError) {
    return new ServiceUnavailableException({
      code: 'LOCATION_DATASET_UNAVAILABLE',
      message: error.message,
    });
  }

  if (error instanceof LocationCountryNotFoundError) {
    return new NotFoundException({
      code: 'LOCATION_COUNTRY_NOT_FOUND',
      message: error.message,
    });
  }

  throw error;
}
