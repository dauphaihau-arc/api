import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import { internalServerErrorExample } from '~/platform/http/api-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

const locationDatasetUnavailableExample: ApiErrorExample = {
  code: 'LOCATION_DATASET_UNAVAILABLE',
  message: 'Location reference dataset is unavailable',
};

const locationCountryNotFoundExample: ApiErrorExample = {
  code: 'LOCATION_COUNTRY_NOT_FOUND',
  message: 'Location country "XX" was not found',
};

/** Public error responses for the location reference endpoints. */
export const locationErrorResponses = {
  listCountries: {
    500: [internalServerErrorExample],
    503: [locationDatasetUnavailableExample],
  },
  listAdministrativeAreas: {
    404: [locationCountryNotFoundExample],
    500: [internalServerErrorExample],
    503: [locationDatasetUnavailableExample],
  },
} satisfies Record<string, ErrorResponses>;
