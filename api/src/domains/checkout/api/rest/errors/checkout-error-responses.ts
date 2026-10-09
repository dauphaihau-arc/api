import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import { unauthorizedErrorExamples } from '~/domains/auth/api/rest/errors/auth-error-examples';

const validationFailed = validationErrorExample([
  { field: 'shipping_address', messages: ['shipping_address must be an object'] },
]);

const validationFailedPresentment = validationErrorExample([
  { field: 'presentment_currency', messages: ['presentment_currency must be a string'] },
]);

const guestCartSessionNotFound = {
  code: 'GUEST_CART_SESSION_NOT_FOUND',
  message: 'Guest cart session not found',
};

const guestTrackingLinkInvalid = {
  code: 'BAD_REQUEST',
  message: 'Invalid or expired guest tracking link',
};

const shopNotFound = { code: 'NOT_FOUND', message: 'Shop was not found' };

const multiCurrencyUnsupported = {
  code: 'BAD_REQUEST',
  message: 'Selected items must use a single checkout currency',
};

const checkoutQuoteNoItems = {
  code: 'CHECKOUT_QUOTE_NO_ITEMS',
  message: 'No selected cart items to quote',
};

const orderTotalLimit = {
  code: 'ORDER_TOTAL_LIMIT_EXCEEDED',
  message: 'Order total exceeds the allowed maximum for the checkout currency',
};

const quoteReservationUnavailable = {
  code: 'CHECKOUT_QUOTE_RESERVATION_UNAVAILABLE',
  message: 'Checkout quote inventory reservation is no longer available',
};

const quoteReservationOutOfStock = {
  code: 'CHECKOUT_QUOTE_RESERVATION_OUT_OF_STOCK',
  message: 'Checkout quote inventory is no longer available',
};

const quoteReservations = [quoteReservationUnavailable, quoteReservationOutOfStock];

const shippingUnavailable = {
  code: 'CHECKOUT_SHIPPING_UNAVAILABLE',
  message: 'Selected items cannot be shipped to the provided address',
  details: {
    products: [{
      product_id: '11111111-1111-4111-8111-111111111111',
      inventory_id: '22222222-2222-4222-8222-222222222222',
      quantity: 1,
      reason: 'unsupported_destination',
      readiness_issues: [],
    }],
  },
};

const pricesChanged = {
  code: 'CHECKOUT_QUOTE_PRICES_CHANGED',
  message:
    'Checkout totals changed since the quote was accepted; review the refreshed totals to continue',
  details: {
    refreshed_totals: {
      checkout_currency: 'USD',
      subtotal_minor: 3000,
      shipping_minor: 500,
      discount_minor: 0,
      sale_discount_minor: 0,
      total_minor: 3500,
      shops: [{
        shop_id: '33333333-3333-4333-8333-333333333333',
        subtotal_minor: 3000,
        discount_minor: 0,
        sale_discount_minor: 0,
        shipping_minor: 500,
        total_minor: 3500,
      }],
    },
  },
};

const quoteCartChanged = {
  code: 'CHECKOUT_QUOTE_CART_CHANGED',
  message: 'Checkout quote no longer matches the selected cart items',
};

const quoteExpired = {
  code: 'CHECKOUT_QUOTE_EXPIRED',
  message: 'Checkout quote expired',
};

const quoteNotFound = {
  code: 'CHECKOUT_QUOTE_NOT_FOUND',
  message: 'Checkout quote not found',
};

const orderNoItems = {
  code: 'ORDER_NO_ITEMS',
  message: 'No selected cart items to order',
};

const shopEntityNotFound = { code: 'SHOP_NOT_FOUND', message: 'Shop not found' };

const inventoryNotFound = {
  code: 'PRODUCT_INVENTORY_NOT_FOUND',
  message: 'Inventory not found',
};

/**
 * Promotion failures reachable from the quote/order pricing workflows. These
 * routes never validate promo codes into the not-applicable reason codes; the
 * checkout filter maps those failures to 422.
 */
const promotionPricingConflicts = [
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
 * Public error response sets for the guest checkout controller, keyed by route
 * handler. These routes are unguarded.
 */
export const checkoutControllerErrorResponses = {
  controller: {
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  getBySession: {
    404: [
      { code: 'CHECKOUT_SESSION_NOT_FOUND', message: 'Checkout session not found' },
      { code: 'CHECKOUT_SESSION_EXPIRED', message: 'Checkout session expired' },
    ],
  },
  lookupGuestOrders: {
    400: [validationFailed, guestTrackingLinkInvalid],
    404: [
      { code: 'NOT_FOUND', message: 'Order was not found' },
      { code: 'CHECKOUT_SESSION_NOT_FOUND', message: 'Checkout session not found' },
      { code: 'CHECKOUT_SESSION_EXPIRED', message: 'Checkout session expired' },
    ],
  },
  createQuoteFromCart: {
    400: [
      validationFailed,
      multiCurrencyUnsupported,
      checkoutQuoteNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [
      guestCartSessionNotFound,
      shopNotFound,
      { code: 'CART_NOT_FOUND', message: 'Cart not found' },
    ],
    409: [shippingUnavailable],
    422: [...promotionPricingConflicts],
  },
  createFromCart: {
    400: [
      validationFailed,
      quoteExpired,
      quoteCartChanged,
      orderNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [
      guestCartSessionNotFound,
      quoteNotFound,
      { code: 'CART_NOT_FOUND', message: 'Cart not found' },
      shopEntityNotFound,
      inventoryNotFound,
    ],
    409: [shippingUnavailable, pricesChanged],
    422: [...promotionPricingConflicts],
  },
  createQuoteForBuyNow: {
    400: [
      validationFailed,
      multiCurrencyUnsupported,
      checkoutQuoteNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [
      guestCartSessionNotFound,
      { code: 'TEMP_CART_NOT_FOUND', message: 'Temporary cart not found' },
    ],
    409: [shippingUnavailable],
    422: [...promotionPricingConflicts],
  },
  createForBuyNow: {
    400: [
      validationFailed,
      quoteExpired,
      quoteCartChanged,
      orderNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [
      guestCartSessionNotFound,
      quoteNotFound,
      { code: 'TEMP_CART_NOT_FOUND', message: 'Temporary cart not found' },
      shopEntityNotFound,
      inventoryNotFound,
    ],
    409: [shippingUnavailable, pricesChanged],
    422: [...promotionPricingConflicts],
  },
};

/**
 * Public error response sets for the authenticated checkout controller. Every
 * route requires a session but declares no permission, so only the 401 guard
 * failure applies as a common status.
 */
export const meCheckoutControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  createQuoteFromCart: {
    400: [
      validationErrorExample([
        { field: 'user_address_id', messages: ['user_address_id must be a UUID'] },
      ]),
      multiCurrencyUnsupported,
      checkoutQuoteNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [
      shopNotFound,
      { code: 'CART_NOT_FOUND', message: 'Cart not found' },
      { code: 'ADDRESS_NOT_FOUND', message: 'Address not found' },
    ],
    409: [shippingUnavailable],
    422: [...promotionPricingConflicts],
  },
  createQuoteForBuyNow: {
    400: [
      validationErrorExample([
        { field: 'user_address_id', messages: ['user_address_id must be a UUID'] },
      ]),
      multiCurrencyUnsupported,
      checkoutQuoteNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [
      { code: 'TEMP_CART_NOT_FOUND', message: 'Temporary cart not found' },
      { code: 'ADDRESS_NOT_FOUND', message: 'Address not found' },
    ],
    409: [shippingUnavailable],
    422: [...promotionPricingConflicts],
  },
  createFromCart: {
    400: [
      validationFailedPresentment,
      quoteExpired,
      quoteCartChanged,
      orderNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [quoteNotFound, { code: 'CART_NOT_FOUND', message: 'Cart not found' }, shopEntityNotFound, inventoryNotFound],
    409: [shippingUnavailable, pricesChanged],
    422: [...promotionPricingConflicts],
  },
  createForBuyNow: {
    400: [
      validationFailedPresentment,
      quoteExpired,
      quoteCartChanged,
      orderNoItems,
      orderTotalLimit,
      ...quoteReservations,
    ],
    404: [quoteNotFound, { code: 'TEMP_CART_NOT_FOUND', message: 'Temporary cart not found' }, shopEntityNotFound, inventoryNotFound],
    409: [shippingUnavailable, pricesChanged],
    422: [...promotionPricingConflicts],
  },
  getCheckoutSessionReadiness: {
    400: [{ code: 'BAD_REQUEST', message: 'order_ids is required' }],
    404: [{ code: 'NOT_FOUND', message: 'Order was not found' }],
  },
  getByCheckoutSession: {
    400: [{ code: 'CHECKOUT_SESSION_ID_REQUIRED', message: 'session_id is required' }],
    404: [
      { code: 'CHECKOUT_SESSION_NOT_FOUND', message: 'Checkout session not found' },
      { code: 'CHECKOUT_SESSION_EXPIRED', message: 'Checkout session expired' },
    ],
  },
};
