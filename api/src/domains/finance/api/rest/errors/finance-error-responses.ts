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

const payoutAccountInvalid = [
  {
    code: 'PAYOUT_ACCOUNT_INVALID',
    message:
      'Payout Account is invalid: account reference must be 4 to 34 letters, digits or dashes',
  },
];

const payoutAccountCurrencyMismatch = [
  {
    code: 'PAYOUT_ACCOUNT_CURRENCY_MISMATCH',
    message:
      'Payout Account currency VND does not match the shop\'s Settlement Currency USD',
  },
];

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
  payoutAccountRead: {
    400: [...payoutAccountCurrencyMismatch],
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  payoutAccountRecord: {
    400: [...payoutAccountInvalid],
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
};

/**
 * Public error response sets for the admin Payout Account controller. The
 * endpoint is gated by `finance.manage` and resolves the shop from its public
 * id without an ownership check.
 */
export const adminPayoutAccountControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  read: {
    400: [...payoutAccountCurrencyMismatch],
    404: [...shopNotFound],
  },
  verification: {
    400: [...payoutAccountInvalid],
    404: [
      ...shopNotFound,
      {
        code: 'PAYOUT_ACCOUNT_NOT_FOUND',
        message: 'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 has no Payout Account to verify',
      },
    ],
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
