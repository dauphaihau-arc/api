export const DEFAULT_PORT = 4100;
export const DEFAULT_WEBHOOK_URL = 'http://127.0.0.1:4000/v1/webhooks/carrier';
export const DEFAULT_WEBHOOK_SECRET = 'carrier-webhook-test-secret';
export const DEFAULT_LOCATION = 'Mock Carrier Facility';

export const CARRIER_PATTERNS = Object.freeze({
  usps: /^9\d{21}$/,
  dhl: /^\d{10}$/,
  vnpost: /^[A-Z]{2}\d{9}VN$/,
});
export const SUPPORTED_CARRIERS = Object.freeze(Object.keys(CARRIER_PATTERNS));

export const JOURNEY_EVENT_CODES = Object.freeze([
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]);
export const ALLOWED_EVENT_CODES = Object.freeze([
  ...JOURNEY_EVENT_CODES,
  'DELIVERY_FAILED',
  'RETURNED',
]);

/** Delay from handover (ms) -> event code for the automatic journey. */
export const AUTO_SCHEDULE = Object.freeze([
  Object.freeze([60_000, 'IN_TRANSIT']),
  Object.freeze([300_000, 'OUT_FOR_DELIVERY']),
  Object.freeze([420_000, 'DELIVERED']),
]);

/** Carriers and services every rate quote covers, in response order. */
export const RATE_CARRIERS = SUPPORTED_CARRIERS;
export const RATE_SERVICES = Object.freeze(['standard', 'express']);

/** Price building blocks, in minor currency units (cents). */
export const CARRIER_PRICING = Object.freeze({
  usps: Object.freeze({ base_minor: 500, per_kg_minor: 400 }),
  dhl: Object.freeze({ base_minor: 700, per_kg_minor: 550 }),
  vnpost: Object.freeze({ base_minor: 300, per_kg_minor: 250 }),
});

/** Per-service price multiplier applied to the carrier subtotal. */
export const SERVICE_MULTIPLIERS = Object.freeze({
  standard: 1,
  express: 1.6,
});

export const SERVICE_ESTIMATED_DAYS = Object.freeze({
  standard: Object.freeze({ min: 3, max: 5 }),
  express: Object.freeze({ min: 1, max: 2 }),
});

/** cm³ per kg used for dimensional (volumetric) weight. */
export const DIMENSIONAL_DIVISOR = 5_000;

/** Quotes stay purchasable for 15 minutes. */
export const RATE_QUOTE_TTL_MS = 15 * 60 * 1000;

/** Package sanity bounds: beyond these a request is not a real parcel. */
export const MAX_WEIGHT_GRAMS = 100_000;
export const MAX_DIMENSION_CM = 300;
