import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';

const validationFailed = validationErrorExample([
  { field: 'cart_id', messages: ['cart_id must be a UUID'] },
]);

const shopNotFound = { code: 'NOT_FOUND', message: 'Shop was not found' };

const cartNotFound = { code: 'CART_NOT_FOUND', message: 'Cart not found' };

const productInventoryNotFound = {
  code: 'PRODUCT_INVENTORY_NOT_FOUND',
  message: 'Product inventory was not found',
};

const productUnavailable = {
  code: 'PRODUCT_UNAVAILABLE_FOR_CART',
  message: 'Product is not available for cart operations',
};

const quantityExceedsStock = {
  code: 'CART_QUANTITY_EXCEEDS_STOCK',
  message: 'Quantity of product exceeds stock',
};

const cartItemNotFound = {
  code: 'CART_ITEM_NOT_FOUND',
  message: 'Cart item was not found',
};

const cartItemProductMismatch = {
  code: 'CART_ITEM_PRODUCT_MISMATCH',
  message:
    'Replacement inventory does not belong to the same product as the cart item',
};

/**
 * Promotion failures the cart pricing/apply workflows can raise. The cart
 * filter maps `PromotionCodeNotFoundError` to 404 and every other promotion
 * application failure to 422.
 */
const promotionNotFound = [
  { code: 'PROMOTION_CODE_NOT_FOUND', message: 'Promotion code not found' },
];

const promotionUnprocessable = [
  {
    code: 'PROMOTION_CODE_NOT_APPLICABLE',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_NOT_STARTED',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_EXPIRED',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_USAGE_LIMIT_REACHED',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_USER_USAGE_LIMIT_REACHED',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_AUTHENTICATION_REQUIRED',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_PRODUCT_SCOPE_MISMATCH',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_MIN_ORDER_VALUE_NOT_MET',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_MIN_PRODUCTS_NOT_MET',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_ZERO_BENEFIT',
    message: 'Promotion code cannot be applied to this cart',
  },
  {
    code: 'PROMOTION_SLOT_CONFLICT',
    message: 'Promotion code cannot be combined with the selected promotion codes',
  },
  {
    code: 'PROMOTION_CURRENCY_CONVERSION_UNAVAILABLE',
    message: 'Promotion code is priced in another currency and cannot be converted',
  },
];

/**
 * Public error response sets for the cart controller, keyed by route handler.
 * The cart routes are guest-accessible (`OptionalJwtAuthGuard` never rejects).
 */
export const cartControllerErrorResponses = {
  controller: {
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  cart: {
    400: [validationFailed],
  },
  promoCodes: {
    400: [validationFailed],
    404: [shopNotFound],
  },
  applyPromoCode: {
    400: [validationFailed],
    404: [cartNotFound, shopNotFound, ...promotionNotFound],
    422: [...promotionUnprocessable],
  },
  addItem: {
    400: [validationFailed, quantityExceedsStock],
    404: [productInventoryNotFound],
    422: [productUnavailable],
  },
  updateItem: {
    400: [validationFailed, quantityExceedsStock, cartItemProductMismatch],
    404: [
      cartNotFound,
      cartItemNotFound,
      productInventoryNotFound,
      shopNotFound,
      ...promotionNotFound,
    ],
    422: [productUnavailable, ...promotionUnprocessable],
  },
  deleteItem: {
    400: [validationFailed],
    404: [cartNotFound, cartItemNotFound],
  },
};
