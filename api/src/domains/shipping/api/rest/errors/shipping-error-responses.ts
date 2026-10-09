import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

const notFoundShopExample: ApiErrorExample = {
  code: 'NOT_FOUND',
  message: 'Shop was not found',
};

const forbiddenOwnShopExample: ApiErrorExample = {
  code: 'FORBIDDEN',
  message: 'You do not own this shop',
};

const profileNotFoundExample: ApiErrorExample = {
  code: 'SHIPPING_PROFILE_NOT_FOUND',
  message: 'Shipping profile was not found',
};

const idempotencyConflictExample: ApiErrorExample = {
  code: 'CONFLICT',
  message: 'An idempotency key is required for this request.',
};

const validationRateExample = validationErrorExample([
  { field: 'rates', messages: ['rates must be an array'] },
]);

export const shopShippingProfilesControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [validationErrorExample([{ field: 'limit', messages: ['limit must not be greater than 100'] }])],
    404: [notFoundShopExample],
  },
  create: {
    400: [validationRateExample],
    404: [notFoundShopExample],
    409: [
      { code: 'SHIPPING_PROFILE_NAME_TAKEN', message: 'Shipping profile name is already used in this shop' },
      idempotencyConflictExample,
    ],
  },
  detail: {
    404: [notFoundShopExample, profileNotFoundExample],
  },
  update: {
    400: [validationErrorExample([{ field: 'version', messages: ['version must be a positive number'] }])],
    404: [notFoundShopExample, profileNotFoundExample],
    409: [
      { code: 'SHIPPING_PROFILE_NAME_TAKEN', message: 'Shipping profile name is already used in this shop' },
      { code: 'SHIPPING_PROFILE_ARCHIVED', message: 'Archived shipping profiles cannot be edited or assigned' },
      {
        code: 'SHIPPING_PROFILE_READINESS_REQUIRED',
        message: 'Published products must be reassigned to a checkout-ready shipping profile before this one can stop pricing checkouts',
        details: { published_product_count: 3 },
      },
      {
        code: 'SHIPPING_PROFILE_VERSION_CONFLICT',
        message: 'Shipping profile was updated by another request',
        details: { version: 4 },
      },
      idempotencyConflictExample,
    ],
  },
  archive: {
    404: [notFoundShopExample, profileNotFoundExample],
    409: [
      {
        code: 'SHIPPING_PROFILE_IN_USE',
        message: 'Published products must be reassigned before this shipping profile can be archived',
        details: { assigned_product_count: 3 },
      },
      {
        code: 'SHIPPING_PROFILE_VERSION_CONFLICT',
        message: 'Shipping profile was updated by another request',
        details: { version: 4 },
      },
      idempotencyConflictExample,
    ],
  },
  setDefault: {
    404: [notFoundShopExample, profileNotFoundExample],
    409: [
      { code: 'SHIPPING_PROFILE_ARCHIVED', message: 'Archived shipping profiles cannot be edited or assigned' },
      { code: 'SHIPPING_PROFILE_NOT_CHECKOUT_READY', message: 'Only a checkout-ready shipping profile can be the shop default' },
    ],
  },
  clearDefault: {
    404: [notFoundShopExample, profileNotFoundExample],
  },
  preview: {
    400: [validationErrorExample([{ field: 'quantity', messages: ['quantity must be a positive number'] }])],
    404: [notFoundShopExample, profileNotFoundExample],
    422: [{ code: 'SHIPPING_PROFILE_INVALID', message: 'Preview quantity must be a positive integer' }],
  },
} as const;
