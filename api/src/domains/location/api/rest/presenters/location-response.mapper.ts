import type { LocationAdministrativeArea, LocationCountry } from '../../../app/location.types';
import type {
  LocationAdministrativeAreaResponseDto,
  LocationCountryResponseDto,
} from '../responses/location-response.dto';

export const toLocationCountryResponse = (
  country: LocationCountry,
): LocationCountryResponseDto => ({
  code: country.code,
  name: country.name,
  has_administrative_areas: country.hasAdministrativeAreas,
  postal_code_required: country.postalCodeRequired,
});

export const toLocationAdministrativeAreaResponse = (
  area: LocationAdministrativeArea,
): LocationAdministrativeAreaResponseDto => ({
  code: area.code,
  name: area.name,
});
