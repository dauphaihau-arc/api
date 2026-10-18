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

/**
 * Public error response sets for the admin Commission Schedule controller. The
 * endpoint is gated by `finance.manage` and resolves the shop from its public
 * id without an ownership check.
 */
export const adminCommissionScheduleControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  record: {
    400: [
      {
        code: 'INVALID_COMMISSION_RATE',
        message:
          'Commission rate 20000 basis points is outside the allowed range 0 to 10000',
      },
    ],
    404: [...shopNotFound],
  },
};
