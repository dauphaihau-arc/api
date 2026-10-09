import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import { unauthorizedErrorExamples } from '~/domains/auth/api/rest/errors/auth-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

const addressNotFoundExample: ApiErrorExample = {
  code: 'ADDRESS_NOT_FOUND',
  message: 'Address not found',
};

// Update/delete throw a code-less NotFoundException, so the rendered code is
// the generic NOT_FOUND fallback rather than ADDRESS_NOT_FOUND.
const addressNotFoundFallbackExample: ApiErrorExample = {
  code: 'NOT_FOUND',
  message: 'Address not found',
};

/** Public error responses for the my-addresses endpoints, selected per route. */
export const meAddressesErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [
      validationErrorExample([
        { field: 'page', messages: ['page must be an integer number'] },
      ]),
    ],
  },
  create: {
    400: [
      validationErrorExample([
        { field: 'full_name', messages: ['full_name must be a string'] },
      ]),
    ],
  },
  detail: {
    404: [addressNotFoundExample],
  },
  update: {
    400: [
      validationErrorExample([
        { field: 'full_name', messages: ['full_name must be a string'] },
      ]),
    ],
    404: [addressNotFoundFallbackExample],
  },
  remove: {
    404: [addressNotFoundFallbackExample],
  },
} satisfies Record<string, ErrorResponses>;
