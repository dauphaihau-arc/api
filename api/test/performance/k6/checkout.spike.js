import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL ?? 'http://127.0.0.1:4000/v1';
const INVENTORY_ID = __ENV.INVENTORY_ID;
const QUANTITY = Number(__ENV.QUANTITY ?? 1);
const PLACE_ORDER = (__ENV.PLACE_ORDER ?? 'false').toLowerCase() === 'true';
const PAYMENT_TYPE = __ENV.PAYMENT_TYPE ?? 'cash';
const scenarioFile = __ENV.SCENARIO || 'flash-sale-inventory.json';
const scenario = JSON.parse(open(`../scenarios/${scenarioFile}`));

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 400));

const quoteReserved = new Rate('checkout_quote_reserved');
const quoteOutOfStock = new Rate('checkout_quote_out_of_stock');
const quoteUnexpected = new Rate('checkout_quote_unexpected');
const orderCreated = new Rate('checkout_order_created');
const expectedCheckoutResult = new Rate('checkout_expected_result');
const checkoutFlowDuration = new Trend('checkout_flow_duration', true);

const vus = Number(__ENV.K6_VUS ?? scenario.vus ?? 200);
const duration = __ENV.K6_DURATION ?? scenario.duration ?? '1m';
const iterations = Number(__ENV.K6_ITERATIONS ?? scenario.iterations ?? vus);
const maxDuration = __ENV.K6_MAX_DURATION ?? scenario.maxDuration ?? '5m';

export const options = {
  ...(PLACE_ORDER
    ? {
      scenarios: {
        checkout: {
          executor: 'shared-iterations',
          vus,
          iterations,
          maxDuration,
        },
      },
    }
    : {
      vus,
      duration,
    }),
  thresholds: scenario.thresholds ?? {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.95'],
    checkout_expected_result: ['rate>0.95'],
  },
};

const shippingAddress = {
  full_name: __ENV.CHECKOUT_FULL_NAME ?? 'Flash Sale Buyer',
  address_1: __ENV.CHECKOUT_ADDRESS_1 ?? '100 Load Test Ave',
  address_2: __ENV.CHECKOUT_ADDRESS_2 ?? '',
  city: __ENV.CHECKOUT_CITY ?? 'San Francisco',
  country: __ENV.CHECKOUT_COUNTRY ?? 'US',
  state: __ENV.CHECKOUT_STATE ?? 'CA',
  zip: __ENV.CHECKOUT_ZIP ?? '94105',
  phone: __ENV.CHECKOUT_PHONE ?? '+14155550123',
};

export function setup() {
  if (!INVENTORY_ID) {
    throw new Error('INVENTORY_ID is required for checkout flash-sale performance tests.');
  }

  if (!Number.isInteger(QUANTITY) || QUANTITY < 1) {
    throw new Error('QUANTITY must be a positive integer.');
  }

  console.log(
    PLACE_ORDER
      ? `checkout.spike mode: PLACE_ORDER=${PLACE_ORDER} PAYMENT_TYPE=${PAYMENT_TYPE} VUS=${vus} ITERATIONS=${iterations} MAX_DURATION=${maxDuration}`
      : `checkout.spike mode: PLACE_ORDER=${PLACE_ORDER} VUS=${vus} DURATION=${duration}`,
  );

  return {
    inventoryId: INVENTORY_ID,
    quantity: QUANTITY,
  };
}

export default function checkoutFlashSale(data) {
  const startedAt = Date.now();
  const addCartResponse = createBuyNowCart(data.inventoryId, data.quantity);
  const guestCookie = extractGuestCartSessionCookie(addCartResponse);
  const cartId = readJson(addCartResponse, 'cart.id');

  const cartCreated = check(addCartResponse, {
    'buy-now cart status is 200 or 201': (res) => res.status === 200 || res.status === 201,
    'buy-now cart id exists': () => typeof cartId === 'string' && cartId.length > 0,
    'guest cart session cookie is set': () => guestCookie.length > 0,
  });

  if (!cartCreated || !cartId || !guestCookie) {
    expectedCheckoutResult.add(isExpectedRejection(addCartResponse));
    checkoutFlowDuration.add(Date.now() - startedAt);
    sleep(Number(scenario.sleepSeconds ?? 0));
    return;
  }

  const quoteResponse = createBuyNowQuote(cartId);
  const quoteId = readJson(quoteResponse, 'quote_id');
  const quoteErrorCode = readJson(quoteResponse, 'code');
  const reserved = (quoteResponse.status === 200 || quoteResponse.status === 201)
    && typeof quoteId === 'string';
  const outOfStock = quoteResponse.status === 400
    && quoteErrorCode === 'CHECKOUT_QUOTE_RESERVATION_OUT_OF_STOCK';

  quoteReserved.add(reserved);
  quoteOutOfStock.add(outOfStock);
  quoteUnexpected.add(!reserved && !outOfStock);
  expectedCheckoutResult.add(reserved || outOfStock);

  check(quoteResponse, {
    'quote status is 200/201 or expected out-of-stock': () => reserved || outOfStock,
    'quote returns quote id on success': () => !reserved || quoteId.length > 0,
    'quote returns an HTTP response below 5xx': (res) =>
      res.status !== 0 && res.status < 500,
  });

  if (!reserved || !PLACE_ORDER) {
    checkoutFlowDuration.add(Date.now() - startedAt);
    sleep(Number(scenario.sleepSeconds ?? 0));
    return;
  }

  const orderResponse = createBuyNowOrder(quoteId);
  const createdOrder = (orderResponse.status === 200 || orderResponse.status === 201)
    && Array.isArray(readJson(orderResponse, 'order_shops'))
    && readJson(orderResponse, 'order_shops').length > 0;

  orderCreated.add(createdOrder);
  expectedCheckoutResult.add(createdOrder || isExpectedRejection(orderResponse));

  check(orderResponse, {
    'order status is 200 or expected checkout rejection': (res) =>
      createdOrder || isExpectedRejection(res),
    'order returns an HTTP response below 5xx': (res) =>
      res.status !== 0 && res.status < 500,
  });

  checkoutFlowDuration.add(Date.now() - startedAt);
  sleep(Number(scenario.sleepSeconds ?? 0));
}

function createBuyNowCart(inventoryId, quantity) {
  return http.post(
    `${BASE_URL}/cart/items`,
    JSON.stringify({
      inventory_id: inventoryId,
      quantity,
      is_temp: true,
    }),
    jsonParams({ name: 'cart.buy_now' }),
  );
}

function createBuyNowQuote(cartId) {
  return http.post(
    `${BASE_URL}/checkout/buy-now/quote`,
    JSON.stringify({
      cart_id: cartId,
      shipping_address: shippingAddress,
      presentment_currency: __ENV.PRESENTMENT_CURRENCY ?? 'USD',
    }),
    jsonParams({
      name: 'checkout.buy_now.quote',
    }),
  );
}

function createBuyNowOrder(quoteId) {
  return http.post(
    `${BASE_URL}/checkout/buy-now`,
    JSON.stringify({
      payment_type: PAYMENT_TYPE,
      quote_id: quoteId,
      guest: {
        email: `flash-sale-${__VU}-${__ITER}@example.com`,
      },
    }),
    jsonParams({
      name: 'checkout.buy_now.order',
    }),
  );
}

function jsonParams({ name } = {}) {
  return {
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': forwardedIp(),
    },
    tags: name ? { name } : undefined,
  };
}

function extractGuestCartSessionCookie(response) {
  const setCookie = String(response.headers['Set-Cookie'] ?? '');
  const match = setCookie.match(/(?:^|,\s*)guestCartSession=([^;]+)/);

  return match?.[1] ?? '';
}

function readJson(response, selector) {
  try {
    return response.json(selector);
  }
  catch {
    return undefined;
  }
}

function isExpectedRejection(response) {
  const code = readJson(response, 'code');

  return response.status === 400 && (
    code === 'CHECKOUT_QUOTE_RESERVATION_OUT_OF_STOCK'
    || code === 'CHECKOUT_QUOTE_RESERVATION_UNAVAILABLE'
  );
}

function forwardedIp() {
  return `203.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}
