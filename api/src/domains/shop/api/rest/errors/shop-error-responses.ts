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

const forbiddenOwnShopExample: ApiErrorExample = {
  code: 'FORBIDDEN',
  message: 'You do not own this shop',
};

/** The shop public id in the route does not resolve to a shop. */
const notFoundShopExample: ApiErrorExample = {
  code: 'NOT_FOUND',
  message: 'Shop was not found',
};

/** The current user has no shop. */
const shopNotFoundErrorExample: ApiErrorExample = {
  code: 'SHOP_NOT_FOUND',
  message: 'Shop was not found',
};

/** The product public id does not resolve to a product in the shop. */
const productNotFoundExample: ApiErrorExample = {
  code: 'NOT_FOUND',
  message: 'Product was not found',
};

/** A required idempotency key is missing, in flight, or reused with a different payload. */
const idempotencyConflictExample: ApiErrorExample = {
  code: 'CONFLICT',
  message: 'An idempotency key is required for this request.',
};

const validationLimitExample = validationErrorExample([
  { field: 'limit', messages: ['limit must not be greater than 100'] },
]);

export const shopControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  create: {
    400: [
      validationErrorExample([{ field: 'shop_name', messages: ['shop_name should not be empty'] }]),
      { code: 'SHOP_SLUG_RESERVED', message: 'This shop slug is reserved' },
      { code: 'USER_ALREADY_OWNS_SHOP', message: 'User already owns a shop' },
    ],
    409: [
      { code: 'SHOP_NAME_ALREADY_TAKEN', message: 'Shop name is already taken' },
      { code: 'SHOP_SLUG_ALREADY_TAKEN', message: 'Shop slug is already taken' },
    ],
  },
  me: {
    404: [shopNotFoundErrorExample],
  },
  updateSettings: {
    400: [
      validationErrorExample([{ field: 'timezone', messages: ['timezone must be a valid IANA time zone'] }]),
      { code: 'SHOP_TIMEZONE_INVALID', message: 'Invalid time zone' },
    ],
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    404: [notFoundShopExample],
  },
} as const;

const productDraftConflictExamples: { code: string; message: string; details?: Record<string, unknown> }[] = [
  { code: 'PRODUCT_VERSION_CONFLICT', message: 'Product Version conflict', details: { product_version: 2 } },
  { code: 'CONFLICT', message: 'An idempotency key is required for this request.' },
];

const productMutationValidationExample = validationErrorExample([
  { field: 'display_name', messages: ['displayName must be a string'] },
]);

export const shopProductsControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [validationLimitExample],
    404: [notFoundShopExample],
  },
  detail: {
    404: [productNotFoundExample],
  },
  createDraft: {
    400: [
      validationErrorExample([{ field: 'title', messages: ['title should not be empty'] }]),
    ],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      notFoundShopExample,
      { code: 'CATEGORY_NOT_FOUND', message: 'Category was not found' },
    ],
  },
  createDraftFacade: {
    400: [
      validationErrorExample([{ field: 'variants', messages: ['variants must be an array'] }]),
      { code: 'INVALID_PRODUCT_ATTRIBUTE_SELECTION', message: 'Invalid product attribute selection' },
    ],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      notFoundShopExample,
      { code: 'CATEGORY_NOT_FOUND', message: 'Category was not found' },
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found' },
    ],
    409: productDraftConflictExamples,
    422: [
      { code: 'INVALID_PRODUCT_VARIANT_CONFIGURATION', message: 'Invalid Product Variant configuration' },
      {
        code: 'PRODUCT_DRAFT_INCOMPLETE',
        message: 'Product draft is incomplete',
        details: { product_id: 'prod_1', failed_step: 'images' },
      },
    ],
  },
  generateDescription: {
    400: [validationErrorExample([{ field: 'prompt', messages: ['prompt should not be empty'] }])],
    404: [notFoundShopExample],
  },
  bulkMutate: {
    400: [validationErrorExample([{ field: 'ids', messages: ['ids must contain at least 1 elements'] }])],
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    404: [notFoundShopExample],
    409: [idempotencyConflictExample],
  },
  updateDetails: {
    400: [
      productMutationValidationExample,
      { code: 'PRODUCT_NOT_READY_TO_PUBLISH', message: 'Product is not ready to publish' },
    ],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      productNotFoundExample,
      { code: 'CATEGORY_NOT_FOUND', message: 'Category was not found' },
    ],
    409: [
      { code: 'PRODUCT_SLUG_ALREADY_EXISTS', message: 'A product with this slug already exists in this shop' },
      { code: 'PRODUCT_VERSION_CONFLICT', message: 'Product Version conflict', details: { product_version: 2 } },
      idempotencyConflictExample,
    ],
  },
  publish: {
    400: [{ code: 'PRODUCT_NOT_READY_TO_PUBLISH', message: 'Product is not ready to publish' }],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      productNotFoundExample,
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found' },
    ],
    409: [idempotencyConflictExample],
  },
  setImages: {
    400: [
      { code: 'PRODUCT_IMAGE_REQUIRED', message: 'At least one image file is required' },
      { code: 'PRODUCT_IMAGE_INVALID_TYPE', message: 'All product image files must be images' },
      { code: 'PRODUCT_IMAGE_EMPTY', message: 'Product image file is empty' },
    ],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      productNotFoundExample,
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found' },
    ],
  },
  setImagesByKeys: {
    400: [validationErrorExample([{ field: 'images', messages: ['images must be an array'] }])],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      productNotFoundExample,
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found' },
    ],
    409: [idempotencyConflictExample],
  },
  setAttributes: {
    400: [
      validationErrorExample([{ field: 'attributes', messages: ['attributes must be an array'] }]),
      { code: 'INVALID_PRODUCT_ATTRIBUTE_SELECTION', message: 'Invalid product attribute selection' },
    ],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      productNotFoundExample,
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found' },
    ],
    409: [idempotencyConflictExample],
  },
  configureVariants: {
    400: [validationErrorExample([{ field: 'options', messages: ['options must be an array'] }])],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      productNotFoundExample,
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found' },
    ],
    409: [
      { code: 'PRODUCT_VERSION_CONFLICT', message: 'Product Version conflict', details: { product_version: 2 } },
      {
        code: 'PRODUCT_SKU_CONFLICT',
        message: 'ProductSkuConflict',
        details: {
          affected_ids: ['inv_1'],
          conflicts: [{ sku: 'SKU-1', inventory_id: 'inv_1', variant_id: 'var_1' }],
        },
      },
      idempotencyConflictExample,
    ],
    422: [{ code: 'INVALID_PRODUCT_VARIANT_CONFIGURATION', message: 'Invalid Product Variant configuration' }],
  },
  assignShippingProfile: {
    400: [validationErrorExample([{ field: 'shipping_profile_id', messages: ['shippingProfileId must be a string'] }])],
    403: [
      missingRequiredPermissionsErrorExample,
      forbiddenOwnShopExample,
      { code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT', message: 'Actor cannot create product drafts for this shop' },
    ],
    404: [
      productNotFoundExample,
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found' },
    ],
    409: [idempotencyConflictExample],
    422: [{ code: 'INVALID_PRODUCT_VARIANT_CONFIGURATION', message: 'Invalid Product Variant configuration' }],
  },
} as const;

export const shopProductImportControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  template: {
    404: [notFoundShopExample],
  },
  start: {
    400: [
      { code: 'MISSING_FILE', message: 'Missing XLSX file' },
      { code: 'FILE_TOO_LARGE', message: 'XLSX file is larger than 10 MB' },
      { code: 'UNSUPPORTED_FILE_TYPE', message: 'Only XLSX uploads are supported' },
    ],
    404: [notFoundShopExample],
    409: [idempotencyConflictExample],
  },
  detail: {
    404: [
      notFoundShopExample,
      { code: 'PRODUCT_IMPORT_NOT_FOUND', message: 'Product import was not found' },
    ],
  },
  report: {
    404: [
      notFoundShopExample,
      { code: 'PRODUCT_IMPORT_NOT_FOUND', message: 'Product import was not found' },
    ],
  },
} as const;

const shopResourceValidationExample = validationErrorExample([
  { field: 'limit', messages: ['limit must not be greater than 100'] },
]);

export const shopPromoCodesControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  create: {
    400: [
      validationErrorExample([{ field: 'code', messages: ['code should not be empty'] }]),
      { code: 'PROMO_CODE_BENEFIT_INVALID', message: 'A percentage promo code needs a percentage from 1 to 99' },
      { code: 'PROMO_CODE_CONDITION_INVALID', message: 'A minimum-spend condition needs a positive amount' },
      { code: 'PROMO_CODE_PRODUCT_SCOPE_INVALID', message: 'A selected product belongs to another shop' },
      { code: 'PROMO_CODE_SCHEDULE_INVALID', message: 'Promo code schedule is invalid' },
      { code: 'PROMO_CODE_TIMEZONE_INVALID', message: 'Promo code time zone is invalid' },
      { code: 'PROMO_CODE_END_AFTER_START_REQUIRED', message: 'Promo code end must be after start' },
      { code: 'PROMO_CODE_LOCAL_TIME_NONEXISTENT', message: 'Local time does not exist' },
      { code: 'PROMO_CODE_LOCAL_TIME_AMBIGUOUS', message: 'Local time is ambiguous' },
    ],
    404: [notFoundShopExample],
    409: [{ code: 'PROMO_CODE_ALREADY_EXISTS', message: 'A promo code with this code already exists in this shop' }],
  },
  list: {
    400: [shopResourceValidationExample],
    404: [notFoundShopExample],
  },
  cancel: {
    404: [
      notFoundShopExample,
      { code: 'PROMO_CODE_NOT_FOUND', message: 'Promo code was not found' },
    ],
    409: [{ code: 'PROMO_CODE_STOP_NOT_ALLOWED', message: 'Promo code lifecycle state does not admit this stop' }],
  },
  end: {
    404: [
      notFoundShopExample,
      { code: 'PROMO_CODE_NOT_FOUND', message: 'Promo code was not found' },
    ],
    409: [{ code: 'PROMO_CODE_STOP_NOT_ALLOWED', message: 'Promo code lifecycle state does not admit this stop' }],
  },
  bulkStop: {
    400: [validationErrorExample([{ field: 'ids', messages: ['ids must contain at least 1 elements'] }])],
    404: [notFoundShopExample],
  },
} as const;

export const shopSalesControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  create: {
    400: [
      validationErrorExample([{ field: 'timezone', messages: ['timezone must be a valid IANA time zone'] }]),
      { code: 'SALE_PRODUCT_SCOPE_INVALID', message: 'A selected product belongs to another shop' },
      { code: 'SALE_SCHEDULE_INVALID', message: 'Sale schedule is invalid' },
      { code: 'SALE_TIMEZONE_INVALID', message: 'Sale time zone is invalid' },
      { code: 'SALE_END_AFTER_START_REQUIRED', message: 'Sale end must be after start' },
      { code: 'SALE_LOCAL_TIME_NONEXISTENT', message: 'Local time does not exist' },
      { code: 'SALE_LOCAL_TIME_AMBIGUOUS', message: 'Local time is ambiguous' },
    ],
    404: [notFoundShopExample],
  },
  list: {
    400: [shopResourceValidationExample],
    404: [notFoundShopExample],
  },
  cancel: {
    404: [
      notFoundShopExample,
      { code: 'SALE_NOT_FOUND', message: 'Sale was not found' },
    ],
    409: [{ code: 'SALE_STOP_NOT_ALLOWED', message: 'Sale lifecycle state does not admit this stop' }],
  },
  end: {
    404: [
      notFoundShopExample,
      { code: 'SALE_NOT_FOUND', message: 'Sale was not found' },
    ],
    409: [{ code: 'SALE_STOP_NOT_ALLOWED', message: 'Sale lifecycle state does not admit this stop' }],
  },
  bulkStop: {
    400: [validationErrorExample([{ field: 'ids', messages: ['ids must contain at least 1 elements'] }])],
    404: [notFoundShopExample],
  },
} as const;

export const shopProductReviewsControllerErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, forbiddenOwnShopExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [validationLimitExample],
    404: [notFoundShopExample],
  },
} as const;
