import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

/** A public Product id that does not resolve to a product. */
const productNotFoundExample: ApiErrorExample = {
  code: 'PRODUCT_NOT_FOUND',
  message: 'Product was not found',
};

/** Authenticated actor does not own the shop named in the route. */
const forbiddenOwnShopExample: ApiErrorExample = {
  code: 'FORBIDDEN',
  message: 'You do not own this shop',
};

const limitValidationExample = validationErrorExample([
  { field: 'limit', messages: ['limit must not be greater than 50'] },
]);

/** Public Storefront product read endpoints (no auth guard). */
export const productControllerErrorResponses = {
  common: {
    500: [internalServerErrorExample],
  },
  suggestions: {
    400: [limitValidationExample],
    429: [rateLimitErrorExample],
  },
  list: {
    400: [limitValidationExample],
    429: [rateLimitErrorExample],
  },
  facets: {
    400: [limitValidationExample],
    429: [rateLimitErrorExample],
  },
  bySlug: {
    404: [productNotFoundExample],
  },
  reviews: {
    400: [limitValidationExample],
    404: [productNotFoundExample],
    429: [rateLimitErrorExample],
  },
  reviewImages: {
    400: [limitValidationExample],
    404: [productNotFoundExample],
    429: [rateLimitErrorExample],
  },
} as const;

export const productActivityControllerErrorResponses = {
  common: {
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
} as const;

export const productInventoryEventsControllerErrorResponses = {
  common: {
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  stream: {
    404: [{ code: 'NOT_FOUND', message: 'Product was not found' }],
  },
} as const;

export const productRecommendationControllerErrorResponses = {
  common: {
    400: [limitValidationExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
} as const;

export const meProductReviewControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  upsert: {
    400: [
      validationErrorExample([
        { field: 'rating', messages: ['rating must not be greater than 5'] },
      ]),
      { code: 'BAD_REQUEST', message: 'Request could not be processed' },
    ],
    403: [{
      code: 'PRODUCT_REVIEW_NOT_ELIGIBLE',
      message: 'This order item is not eligible for review yet',
    }],
    404: [{
      code: 'PRODUCT_REVIEW_ORDER_ITEM_NOT_FOUND',
      message: 'Order item was not found',
    }],
    429: [
      rateLimitErrorExample,
      { code: 'PRODUCT_REVIEW_EDIT_LIMIT_EXCEEDED', message: 'Product review edit limit exceeded' },
    ],
  },
} as const;

export const reviewImageUploadControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  issue: {
    400: [
      validationErrorExample([
        { field: 'content_type', messages: ['content_type must be a string'] },
      ]),
      { code: 'BAD_REQUEST', message: 'Upload content type must be an image' },
    ],
  },
  upload: {
    400: [{ code: 'BAD_REQUEST', message: 'Upload body is empty' }],
    404: [{ code: 'NOT_FOUND', message: 'Upload ticket was not found or has expired' }],
  },
} as const;

export const productUploadControllerErrorResponses = {
  common: {
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  issue: {
    400: [
      validationErrorExample([
        { field: 'content_type', messages: ['content_type must be a string'] },
      ]),
      { code: 'BAD_REQUEST', message: 'Upload content type must be an image' },
    ],
    401: unauthorizedErrorExamples,
    403: [forbiddenOwnShopExample],
    404: [{ code: 'NOT_FOUND', message: 'Product was not found' }],
  },
  upload: {
    400: [{ code: 'BAD_REQUEST', message: 'Upload body is empty' }],
    404: [{ code: 'NOT_FOUND', message: 'Upload ticket was not found or has expired' }],
  },
} as const;
