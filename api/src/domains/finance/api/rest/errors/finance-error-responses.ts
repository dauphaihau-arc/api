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
    message: 'Payout Account is invalid: country must be an ISO 3166-1 alpha-2 code',
  },
];

const payoutAccountCountryUnsupported = [
  {
    code: 'PAYOUT_ACCOUNT_COUNTRY_UNSUPPORTED',
    message:
      'Stripe Connect does not support onboarding sellers in XX; contact support to arrange another payout route',
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
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  payouts: {
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  transactions: {
    400: [
      {
        code: 'VALIDATION_ERROR',
        message: 'limit must not be greater than 100',
      },
    ],
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  payoutAccountOnboarding: {
    400: [...payoutAccountInvalid, ...payoutAccountCountryUnsupported],
    403: [...shopForbidden],
    404: [...shopNotFound],
    502: [
      {
        code: 'CONNECT_ACCOUNT_CONFIGURATION_ERROR',
        message:
          'Stripe Connect cannot onboard sellers with the current configuration',
      },
    ],
    503: [
      {
        code: 'PAYOUT_PROVIDER_NOT_CONFIGURED',
        message: 'Stripe Connect is not configured',
      },
    ],
  },
  payoutSettingsRead: {
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  payoutSettingsUpdate: {
    400: [
      {
        code: 'VALIDATION_ERROR',
        message: 'auto_payout_enabled must be a boolean',
      },
    ],
    403: [...shopForbidden],
    404: [...shopNotFound],
    409: [
      {
        code: 'AUTO_PAYOUT_NOT_ELIGIBLE',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 is not eligible for automatic payouts: no_payout_account',
      },
    ],
  },
  settlementCurrencyRead: {
    403: [...shopForbidden],
    404: [...shopNotFound],
  },
  settlementCurrencyChange: {
    400: [
      {
        code: 'VALIDATION_ERROR',
        message: 'currency must be one of the following values: USD, EUR',
      },
      {
        code: 'SETTLEMENT_CURRENCY_UNSUPPORTED',
        message: 'Settlement Currency XXX is not accepted by the marketplace',
      },
      {
        code: 'SETTLEMENT_CURRENCY_UNCHANGED',
        message: 'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 already settles in EUR',
      },
    ],
    403: [...shopForbidden],
    404: [...shopNotFound],
    409: [
      {
        code: 'SETTLEMENT_CURRENCY_BALANCE_NOT_ZERO',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 still holds Seller Payable (1200 available, 0 not yet available) and cannot change Settlement Currency',
      },
      {
        code: 'SETTLEMENT_CURRENCY_PAYOUT_PENDING',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 has a Payout that is still pending; wait for it to settle before changing Settlement Currency',
      },
      {
        code: 'SETTLEMENT_CURRENCY_CHANGE_TOO_SOON',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 changed Settlement Currency less than 90 days ago; the next change is allowed from 2027-01-20T09:30:00.000Z',
      },
    ],
    503: [
      {
        code: 'SETTLEMENT_CURRENCY_RATE_UNAVAILABLE',
        message: 'No exchange rate converts the Settlement Currency from USD to EUR',
      },
    ],
  },
  payoutQuote: {
    400: [
      {
        code: 'PAYOUT_ACCOUNT_UNUSABLE',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 has no usable Payout Account for a manual withdrawal: no_payout_account',
      },
      {
        code: 'PAYOUT_AMOUNT_NOT_POSITIVE',
        message: 'Payout amount 0 minor units is not positive',
      },
      {
        code: 'VALIDATION_ERROR',
        message: 'amount_minor must be an integer number',
      },
    ],
    403: [...shopForbidden],
    404: [...shopNotFound],
    503: [
      {
        code: 'PAYOUT_CONVERSION_RATE_UNAVAILABLE',
        message: 'No exchange rate converts a payout from USD to VND',
      },
    ],
  },
  orderPayout: {
    403: [...shopForbidden],
    404: [
      ...shopNotFound,
      { code: 'ORDER_NOT_FOUND', message: 'Order was not found' },
    ],
  },
  manualPayout: {
    400: [
      {
        code: 'PAYOUT_ACCOUNT_UNUSABLE',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 has no usable Payout Account for a manual withdrawal: no_payout_account',
      },
      {
        code: 'PAYOUT_AMOUNT_EXCEEDS_AVAILABLE',
        message: 'Payout amount 90000 minor units exceeds the available 12500 minor units',
      },
      {
        code: 'PAYOUT_AMOUNT_NOT_POSITIVE',
        message: 'Payout amount 0 minor units is not positive',
      },
      {
        code: 'NO_PAYABLE_AMOUNT',
        message: 'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 has no available Seller Payable to withdraw',
      },
    ],
    403: [...shopForbidden],
    404: [...shopNotFound],
    409: [
      {
        code: 'MANUAL_PAYOUT_ALREADY_USED',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 already used its manual withdrawal for 2026-10',
      },
      {
        code: 'PAYOUT_PENDING',
        message:
          'Shop 8f1c2e5a-3b7d-4c9e-9a01-2d5e7a9c4b18 has a Payout that is still pending; wait for it to settle before withdrawing again',
      },
    ],
    503: [
      {
        code: 'PAYOUT_CONVERSION_RATE_UNAVAILABLE',
        message: 'No exchange rate converts a payout from USD to VND',
      },
    ],
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
    404: [...shopNotFound],
  },
};

/**
 * Public error response sets for the admin shop finance controller. Every
 * endpoint is gated by `finance.manage` and resolves the shop from its public
 * id without an ownership check.
 */
export const adminShopFinanceControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  payable: {
    404: [...shopNotFound],
  },
  payouts: {
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
  read: {
    404: [...shopNotFound],
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
