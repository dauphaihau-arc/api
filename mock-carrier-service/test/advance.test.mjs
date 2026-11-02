import test from 'node:test';
import assert from 'node:assert/strict';
import { request, startTestServer } from './helpers.mjs';

let harness;

test.before(async () => {
  harness = await startTestServer();
});

test.after(async () => {
  await harness.close();
});

async function handedOverParcel(carrier = 'usps') {
  const created = await request(harness.baseUrl, 'POST', '/parcels', { carrier });
  assert.equal(created.status, 201);
  const handed = await request(harness.baseUrl, 'POST', `/parcels/${created.body.parcel.tracking_number}/handover`, {
    carrier,
  });
  assert.equal(handed.status, 202);
  return handed.body.parcel;
}

test('manual advance before handover returns 409 NOT_HANDED_OVER', async () => {
  const created = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'usps' });
  const response = await request(
    harness.baseUrl,
    'POST',
    `/parcels/${created.body.parcel.tracking_number}/advance`,
    { carrier: 'usps' },
  );
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'NOT_HANDED_OVER');
});

test('manual advance emits the next journey event in order', async () => {
  const parcel = await handedOverParcel('usps');
  const expected = ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

  for (const code of expected) {
    const before = harness.clock.iso();
    const response = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/advance`, {
      carrier: 'usps',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.emitted.event_code, code);
    assert.equal(response.body.emitted.occurred_at, before);
    const codes = response.body.parcel.events.map((event) => event.event_code);
    assert.deepEqual(codes, ['PICKED_UP', ...expected.slice(0, expected.indexOf(code) + 1)]);
  }

  const complete = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/advance`, {
    carrier: 'usps',
  });
  assert.equal(complete.status, 409);
  assert.equal(complete.body.code, 'JOURNEY_COMPLETE');
});

test('manual advance can emit a chosen code such as DELIVERY_FAILED and RETURNED', async () => {
  for (const code of ['DELIVERY_FAILED', 'RETURNED']) {
    const parcel = await handedOverParcel('dhl');
    const response = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/advance`, {
      carrier: 'dhl',
      event_code: code,
      location: 'Springfield Sorting Center',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.emitted.event_code, code);
    assert.equal(response.body.emitted.location, 'Springfield Sorting Center');
    assert.equal(response.body.parcel.events.at(-1).event_code, code);
  }
});

test('every manual advance is delivered to the webhook with a valid signature', async () => {
  const parcel = await handedOverParcel('vnpost');
  const before = harness.webhook.deliveries.length;

  const response = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/advance`, {
    carrier: 'vnpost',
    event_code: 'DELIVERY_FAILED',
    location: 'Da Nang Depot',
  });

  assert.equal(response.status, 200);
  assert.equal(harness.webhook.deliveries.length, before + 1);
  const delivery = harness.webhook.deliveries.at(-1);
  assert.equal(delivery.signatureValid, true);
  assert.equal(delivery.json.event_code, 'DELIVERY_FAILED');
  assert.equal(delivery.json.location, 'Da Nang Depot');
  assert.equal(delivery.json.tracking_number, parcel.tracking_number);
  assert.equal(delivery.json.event_id, response.body.emitted.event_id);
});

test('manual advance cancels pending automatic timers and disables auto', async () => {
  const parcel = await handedOverParcel('usps');
  assert.equal(harness.scheduler.size(), 3);

  const response = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/advance`, {
    carrier: 'usps',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.parcel.auto, false);
  assert.equal(harness.scheduler.size(), 0, 'pending timers must be cancelled');

  const deliveredBefore = harness.webhook.deliveries.length;
  await harness.scheduler.flush();
  const stored = await request(harness.baseUrl, 'GET', `/parcels/${parcel.tracking_number}`);
  assert.equal(stored.body.parcel.events.length, 2);
  assert.equal(harness.webhook.deliveries.length, deliveredBefore);
});

test('invalid event codes are rejected with 400', async () => {
  const parcel = await handedOverParcel('usps');
  const response = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/advance`, {
    carrier: 'usps',
    event_code: 'LOST_IN_SPACE',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_EVENT_CODE');
});

test('advancing an unknown parcel returns 404', async () => {
  const response = await request(harness.baseUrl, 'POST', '/parcels/UNKNOWN123/advance', { carrier: 'usps' });
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'PARCEL_NOT_FOUND');
});
