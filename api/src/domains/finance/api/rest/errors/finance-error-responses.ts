import {
  internalServerErrorExample,
  rateLimitErrorExample,
} from '~/platform/http/api-error-examples';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

const shopForbidden = [
  missingRequiredPermissionsErrorExample,
  { code: 'FORBIDDEN', message: 'You do not own this shop' },
];

const shopNotFound = [{ code: 'NOT_FOUND', message: 'Shop was not found' }];

/**
 * Public error response sets for the seller finance controller. Every endpoint
 * resolves the shop from its public id and requires the shop management
 * permission, so ownership and permission failures are answerable everywhere.
 */
export const shopFinanceControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [...shopForbidden],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  payable: {
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
};
