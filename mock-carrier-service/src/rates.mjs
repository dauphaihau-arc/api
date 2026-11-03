import { randomUUID } from 'node:crypto';
import {
  CARRIER_PRICING,
  DIMENSIONAL_DIVISOR,
  MAX_DIMENSION_CM,
  MAX_WEIGHT_GRAMS,
  RATE_CARRIERS,
  RATE_QUOTE_TTL_MS,
  RATE_SERVICES,
  SERVICE_ESTIMATED_DAYS,
  SERVICE_MULTIPLIERS,
} from './constants.mjs';
import { HttpError } from './http.mjs';

/**
 * Float noise guard: prices are exact multiples of 1/5000 before the service
 * multiplier, so subtracting this never swallows a genuine fraction.
 */
const PRICE_EPSILON = 1e-9;

const PACKAGE_FIELDS = Object.freeze([
  Object.freeze(['weight_grams', MAX_WEIGHT_GRAMS]),
  Object.freeze(['length_cm', MAX_DIMENSION_CM]),
  Object.freeze(['width_cm', MAX_DIMENSION_CM]),
  Object.freeze(['height_cm', MAX_DIMENSION_CM]),
]);

function invalidPackage(message) {
  return new HttpError(400, 'INVALID_PACKAGE', message);
}

function invalidCurrency(currency) {
  return new HttpError(
    400,
    'INVALID_CURRENCY',
    `Currency "${String(currency)}" must be a 3-letter uppercase ISO code.`,
  );
}

/**
 * Billable weight in kg: the greater of actual weight and volumetric weight
 * (cm³ / 5000).
 */
export function calculateBillableWeightKg(pkg) {
  const actualKg = pkg.weight_grams / 1000;
  const volumetricKg = (pkg.length_cm * pkg.width_cm * pkg.height_cm) / DIMENSIONAL_DIVISOR;
  return Math.max(actualKg, volumetricKg);
}

/** Price in integer minor units for one carrier/service at a billable weight. */
export function calculatePriceMinor(carrier, service, billableKg) {
  const { base_minor: baseMinor, per_kg_minor: perKgMinor } = CARRIER_PRICING[carrier];
  const multiplier = SERVICE_MULTIPLIERS[service];
  return Math.ceil((baseMinor + perKgMinor * billableKg) * multiplier - PRICE_EPSILON);
}

/** Validates and normalizes a rate request body into a package + currency. */
export function parseRateRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const pkg = {};
  for (const [field, max] of PACKAGE_FIELDS) {
    const value = body[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
      throw invalidPackage(
        `"${field}" must be a positive integer no greater than ${max} (grams for weight, cm for dimensions).`,
      );
    }
    pkg[field] = value;
  }

  const { currency } = body;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw invalidCurrency(currency);
  }

  return { ...pkg, currency };
}

function cloneRate(rate) {
  return { ...rate, estimated_days: { ...rate.estimated_days } };
}

/**
 * Prices one package into six quotable options and remembers each option so it
 * can be bought exactly once via `POST /labels`. Quoting still has no parcel or
 * label side effect: it only records the quotes (with their expiry) in memory.
 */
export function createRateService({ now = () => Date.now() } = {}) {
  /** quote_id -> { rate, expires_at (ms), used } */
  const quotes = new Map();

  return {
    quote(body) {
      const request = parseRateRequest(body);
      const billableKg = calculateBillableWeightKg(request);
      const expiresAtMs = now() + RATE_QUOTE_TTL_MS;
      const expiresAt = new Date(expiresAtMs).toISOString();

      const rates = [];
      for (const carrier of RATE_CARRIERS) {
        for (const service of RATE_SERVICES) {
          const rate = {
            quote_id: `rq_${randomUUID()}`,
            carrier,
            service,
            price_minor: calculatePriceMinor(carrier, service, billableKg),
            currency: request.currency,
            estimated_days: { ...SERVICE_ESTIMATED_DAYS[service] },
            expires_at: expiresAt,
          };
          quotes.set(rate.quote_id, { rate, expires_at: expiresAtMs, used: false });
          rates.push(rate);
        }
      }

      return { rates: rates.map(cloneRate) };
    },

    /**
     * Resolves a stored quote for purchase, without consuming it. Throws the
     * contract errors: 404 unknown, 410 expired, 409 already used. The caller
     * marks it used once the purchase actually succeeded.
     */
    lookup(quoteId) {
      const entry = quotes.get(quoteId);
      if (!entry) {
        throw new HttpError(404, 'QUOTE_NOT_FOUND', `No rate quote with id ${quoteId}.`);
      }
      if (now() > entry.expires_at) {
        throw new HttpError(410, 'QUOTE_EXPIRED', `Rate quote ${quoteId} has expired.`);
      }
      if (entry.used) {
        throw new HttpError(409, 'QUOTE_ALREADY_USED', `Rate quote ${quoteId} was already used.`);
      }
      return cloneRate(entry.rate);
    },

    /** Marks a looked-up quote as bought, making any further purchase a 409. */
    markUsed(quoteId) {
      const entry = quotes.get(quoteId);
      if (entry) entry.used = true;
    },

    /** Number of stored quotes (expired ones stay until the process restarts). */
    quoteCount() {
      return quotes.size;
    },
  };
}
