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
