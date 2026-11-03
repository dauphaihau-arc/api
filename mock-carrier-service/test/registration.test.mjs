import test from 'node:test';
import assert from 'node:assert/strict';
import { request, startTestServer } from './helpers.mjs';

const PATTERNS = {
  usps: /^9\d{21}$/,
  dhl: /^\d{10}$/,
  vnpost: /^[A-Z]{2}\d{9}VN$/,
};

let harness;

test.before(async () => {
  harness = await startTestServer();
});

test.after(async () => {
  await harness.close();
});

test('health endpoint reports ok', async () => {
  const response = await request(harness.baseUrl, 'GET', '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('registers a parcel per supported carrier and generates formatted tracking numbers', async () => {
  for (const carrier of Object.keys(PATTERNS)) {
    const response = await request(harness.baseUrl, 'POST', '/parcels', { carrier });
    assert.equal(response.status, 201, `expected 201 for ${carrier}`);
    const { parcel } = response.body;
    assert.equal(parcel.carrier, carrier);
    assert.match(parcel.tracking_number, PATTERNS[carrier]);
    assert.equal(parcel.handed_over_at, null);
    assert.equal(parcel.auto, false);
    assert.deepEqual(parcel.events, []);
  }
});

test('generated tracking numbers are unique per registration', async () => {
  const first = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'dhl' });
  const second = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'dhl' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.body.parcel.tracking_number, second.body.parcel.tracking_number);
});

test('accepts a supplied tracking number that matches the carrier pattern', async () => {
  for (const [carrier, trackingNumber] of Object.entries({
    usps: '9400111899223197428490',
    dhl: '1234567890',
    vnpost: 'EA123456789VN',
  })) {
    assert.match(trackingNumber, PATTERNS[carrier], 'fixture must satisfy carrier pattern');
    const response = await request(harness.baseUrl, 'POST', '/parcels', {
      carrier,
      tracking_number: trackingNumber,
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.parcel.tracking_number, trackingNumber);
  }
});

test('re-registering the same carrier and tracking number returns the existing parcel with 200', async () => {
  const trackingNumber = '9400111899223197428490';
  const first = await request(harness.baseUrl, 'GET', '/parcels/' + trackingNumber);
  assert.equal(first.status, 200);

  const again = await request(harness.baseUrl, 'POST', '/parcels', {
    carrier: 'usps',
    tracking_number: trackingNumber,
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.parcel.tracking_number, trackingNumber);
  assert.deepEqual(again.body.parcel, first.body.parcel);
});

test('rejects a supplied tracking number that fails the carrier pattern', async () => {
  const cases = [
    { carrier: 'usps', tracking_number: '123' },
    { carrier: 'dhl', tracking_number: 'ABC1234567' },
    { carrier: 'vnpost', tracking_number: 'VN123456789EA' },
  ];
  for (const body of cases) {
    const response = await request(harness.baseUrl, 'POST', '/parcels', body);
    assert.equal(response.status, 422);
    assert.equal(response.body.code, 'INVALID_TRACKING_NUMBER');
    assert.equal(typeof response.body.message, 'string');
  }
});

test('rejects other and unknown carriers', async () => {
  for (const carrier of ['other', 'fedex', 'UPS', 42]) {
    const response = await request(harness.baseUrl, 'POST', '/parcels', { carrier });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, 'UNSUPPORTED_CARRIER');
  }

  const missing = await request(harness.baseUrl, 'POST', '/parcels', {});
  assert.equal(missing.status, 422);
  assert.equal(missing.body.code, 'UNSUPPORTED_CARRIER');
});

test('no scan events exist before handover', async () => {
  const created = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'vnpost' });
  const { tracking_number: trackingNumber } = created.body.parcel;
  const fetched = await request(harness.baseUrl, 'GET', `/parcels/${trackingNumber}`);
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body.parcel.events, []);
  assert.equal(fetched.body.parcel.handed_over_at, null);
  assert.equal(harness.webhook.deliveries.length, 0);
});

test('unknown parcel lookups return 404', async () => {
  const response = await request(harness.baseUrl, 'GET', '/parcels/DOES-NOT-EXIST');
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'PARCEL_NOT_FOUND');
});
