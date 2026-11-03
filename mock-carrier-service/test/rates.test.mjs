import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARRIER_PRICING,
  DIMENSIONAL_DIVISOR,
  RATE_CARRIERS,
  RATE_SERVICES,
  SERVICE_MULTIPLIERS,
} from '../src/constants.mjs';
import {
  calculateBillableWeightKg,
  calculatePriceMinor,
  createRateService,
} from '../src/rates.mjs';
import { createFakeClock, request, startTestServer } from './helpers.mjs';

const PACKAGE = {
  weight_grams: 1000,
  length_cm: 10,
  width_cm: 10,
  height_cm: 10,
  currency: 'USD',
};

const QUOTE_ID_PATTERN = /^rq_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function quote(harness, overrides = {}) {
  return request(harness.baseUrl, 'POST', '/rates', { ...PACKAGE, ...overrides });
}

let harness;

test.before(async () => {
  harness = await startTestServer();
});

test.after(async () => {
  await harness.close();
});

test('quotes six rates covering every carrier and service, never "other"', async () => {
  const response = await quote(harness);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body), ['rates']);

  const { rates } = response.body;
  assert.equal(rates.length, 6);
  assert.deepEqual(
    rates.map((rate) => `${rate.carrier}/${rate.service}`).sort(),
    RATE_CARRIERS.flatMap((carrier) =>
      RATE_SERVICES.map((service) => `${carrier}/${service}`),
    ).sort(),
  );
  for (const rate of rates) {
    assert.ok(!rate.carrier.includes('other'));
    assert.ok(['standard', 'express'].includes(rate.service));
    assert.match(rate.quote_id, QUOTE_ID_PATTERN);
    assert.equal(Number.isInteger(rate.price_minor), true);
    assert.ok(rate.price_minor > 0);
  }
});

test('prices a known package with the documented formula', async () => {
  const response = await quote(harness);
  assert.equal(response.status, 200);

  // 1kg actual vs 1000cm3/5000 = 0.2kg volumetric -> billable 1kg.
  const billableKg = calculateBillableWeightKg(PACKAGE);
  assert.equal(billableKg, 1);

  const expected = {
    'usps/standard': 900,
    'usps/express': 1440,
    'dhl/standard': 1250,
    'dhl/express': 2000,
    'vnpost/standard': 550,
    'vnpost/express': 880,
  };

  for (const rate of response.body.rates) {
    const key = `${rate.carrier}/${rate.service}`;
    const { base_minor: baseMinor, per_kg_minor: perKgMinor } = CARRIER_PRICING[rate.carrier];
    const formula = Math.ceil(
      (baseMinor + perKgMinor * billableKg) * SERVICE_MULTIPLIERS[rate.service],
    );
    assert.equal(rate.price_minor, expected[key], `${key} price`);
    assert.equal(rate.price_minor, formula, `${key} matches base + perKg * billableKg`);
    assert.equal(rate.price_minor, calculatePriceMinor(rate.carrier, rate.service, billableKg));
  }
});

test('dimensional weight beats actual weight when volume is larger', async () => {
  const dimPackage = {
    ...PACKAGE,
    weight_grams: 200,
    length_cm: 50,
    width_cm: 40,
    height_cm: 30,
  };
  const response = await request(harness.baseUrl, 'POST', '/rates', dimPackage);
  assert.equal(response.status, 200);

  const volumetricKg = (50 * 40 * 30) / DIMENSIONAL_DIVISOR;
  assert.equal(volumetricKg, 12);
  assert.equal(calculateBillableWeightKg(dimPackage), 12);

  const byKey = new Map(
    response.body.rates.map((rate) => [`${rate.carrier}/${rate.service}`, rate]),
  );
  assert.equal(byKey.get('usps/standard').price_minor, 500 + 400 * 12);
  assert.equal(byKey.get('usps/express').price_minor, Math.ceil((500 + 400 * 12) * 1.6));
  assert.equal(byKey.get('dhl/standard').price_minor, 700 + 550 * 12);
  assert.equal(byKey.get('vnpost/standard').price_minor, 300 + 250 * 12);

});

test('estimated days follow the service and expires_at is 15 minutes ahead', async () => {
  const response = await quote(harness);
  assert.equal(response.status, 200);

  const { clock } = harness;
  const expectedExpiry = new Date(clock.now() + 15 * 60 * 1000).toISOString();
  for (const rate of response.body.rates) {
    const days = rate.service === 'express' ? { min: 1, max: 2 } : { min: 3, max: 5 };
    assert.deepEqual(rate.estimated_days, days);
    assert.equal(rate.expires_at, expectedExpiry);
    assert.equal(Date.parse(rate.expires_at) - clock.now(), 15 * 60 * 1000);
  }
});

test('echoes the requested currency on every rate', async () => {
  const response = await quote(harness, { currency: 'EUR' });
  assert.equal(response.status, 200);
  for (const rate of response.body.rates) assert.equal(rate.currency, 'EUR');
});

test('mints one unique quote id per priced option', async () => {
  const first = await quote(harness);
  const second = await quote(harness);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const firstIds = first.body.rates.map((rate) => rate.quote_id);
  const secondIds = second.body.rates.map((rate) => rate.quote_id);
  assert.equal(new Set(firstIds).size, 6);
  assert.equal(new Set(secondIds).size, 6);
  for (const id of firstIds) assert.ok(!secondIds.includes(id), `${id} leaked across requests`);

});

test('rejects invalid package fields with 400 INVALID_PACKAGE', async () => {
  const empty = await request(harness.baseUrl, 'POST', '/rates', {});
  assert.equal(empty.status, 400);
  assert.equal(empty.body.code, 'INVALID_PACKAGE');

  const cases = [
    { weight_grams: 0 },
    { weight_grams: -10 },
    { weight_grams: 1000.5 },
    { weight_grams: '1000' },
    { weight_grams: null },
    { length_cm: 0 },
    { width_cm: undefined },
    { height_cm: 301 },
    { length_cm: 1000 },
    { weight_grams: 100_001 },
  ];

  for (const override of cases) {
    const response = await quote(harness, override);
    assert.equal(response.status, 400, JSON.stringify(override));
    assert.equal(response.body.code, 'INVALID_PACKAGE', JSON.stringify(override));
    assert.equal(typeof response.body.message, 'string');
  }
});

test('rejects malformed currencies with 400 INVALID_CURRENCY', async () => {
  for (const currency of ['usd', 'US', 'USDD', 'U5D', '', 123, null]) {
    const response = await quote(harness, { currency });
    assert.equal(response.status, 400, String(currency));
    assert.equal(response.body.code, 'INVALID_CURRENCY', String(currency));
  }
});

test('rejects malformed JSON and non-object bodies', async () => {
  const invalidJson = await request(harness.baseUrl, 'POST', '/rates', '{not json');
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.body.code, 'INVALID_JSON');

  const arrayBody = await request(harness.baseUrl, 'POST', '/rates', '[]');
  assert.equal(arrayBody.status, 400);
  assert.equal(arrayBody.body.code, 'INVALID_BODY');
});

test('only POST /rates exists', async () => {
  const get = await request(harness.baseUrl, 'GET', '/rates');
  assert.equal(get.status, 405);
  assert.equal(get.body.code, 'METHOD_NOT_ALLOWED');

  const nested = await request(harness.baseUrl, 'POST', '/rates/extra', PACKAGE);
  assert.equal(nested.status, 404);
  assert.equal(nested.body.code, 'NOT_FOUND');
});

test('quoting never registers a parcel', async () => {
  const before = harness.service.parcelCount();
  const response = await quote(harness);
  assert.equal(response.status, 200);
  assert.equal(harness.service.parcelCount(), before);

  const lookup = await request(harness.baseUrl, 'GET', '/parcels/0000000000000000000000');
  assert.equal(lookup.status, 404);
  assert.equal(lookup.body.code, 'PARCEL_NOT_FOUND');
  assert.equal(harness.service.parcelCount(), before);
});

