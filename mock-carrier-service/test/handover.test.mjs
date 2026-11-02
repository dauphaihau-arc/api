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

async function registeredParcel(carrier = 'usps') {
  const response = await request(harness.baseUrl, 'POST', '/parcels', { carrier });
  assert.equal(response.status, 201);
  return response.body.parcel;
}

test('handover emits PICKED_UP synchronously and schedules relay events', async () => {
  const parcel = await registeredParcel('usps');
  const t0 = harness.clock.iso();

  const response = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/handover`, {
    carrier: 'usps',
  });

  assert.equal(response.status, 202);
  const updated = response.body.parcel;
  assert.equal(updated.handed_over_at, t0);
  assert.equal(updated.auto, true);
  assert.deepEqual(
    updated.events.map((event) => event.event_code),
    ['PICKED_UP'],
  );
  assert.equal(updated.events[0].occurred_at, t0);
  assert.match(updated.events[0].event_id, /^evt-[0-9a-f-]{36}$/);
  assert.equal(typeof updated.events[0].location, 'string');
  assert.equal(harness.scheduler.pending().join(','), '60000,300000,420000');
  assert.equal(harness.scheduler.size(), 3);
});

test('handover webhook carries the signed event payload', async () => {
  const parcel = await registeredParcel('vnpost');
  const before = harness.webhook.deliveries.length;
  await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/handover`, { carrier: 'vnpost' });

  assert.equal(harness.webhook.deliveries.length, before + 1);
  const delivery = harness.webhook.deliveries.at(-1);
  assert.equal(delivery.signatureValid, true, 'HMAC must cover the exact request body');
  assert.equal(delivery.contentType, 'application/json');
  assert.match(delivery.signature, /^sha256=[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(delivery.json).sort(), [
    'carrier',
    'event_code',
    'event_id',
    'location',
    'occurred_at',
    'tracking_number',
  ]);
  assert.equal(delivery.json.carrier, 'vnpost');
  assert.equal(delivery.json.tracking_number, parcel.tracking_number);
  assert.equal(delivery.json.event_code, 'PICKED_UP');
  assert.match(delivery.json.event_id, /^evt-[0-9a-f-]{36}$/);
  assert.equal(typeof delivery.json.location, 'string');
  assert.equal(delivery.json.occurred_at, harness.clock.iso());

  const stored = await request(harness.baseUrl, 'GET', `/parcels/${parcel.tracking_number}`);
  const event = stored.body.parcel.events[0];
  assert.deepEqual(delivery.json, {
    event_id: event.event_id,
    carrier: 'vnpost',
    tracking_number: parcel.tracking_number,
    event_code: 'PICKED_UP',
    location: event.location,
    occurred_at: event.occurred_at,
  });
});

test('repeated handover is a no-op: no duplicate event, no rescheduling', async () => {
  const parcel = await registeredParcel('dhl');
  const timersBefore = harness.scheduler.size();
  const first = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/handover`, {
    carrier: 'dhl',
  });
  assert.equal(first.status, 202);
  assert.equal(harness.scheduler.size(), timersBefore + 3);

  const deliveriesAfterFirst = harness.webhook.deliveries.length;
  const second = await request(harness.baseUrl, 'POST', `/parcels/${parcel.tracking_number}/handover`, {
    carrier: 'dhl',
  });

  assert.equal(second.status, 202);
  assert.equal(second.body.parcel.events.length, 1);
  assert.equal(second.body.parcel.handed_over_at, first.body.parcel.handed_over_at);
  assert.equal(harness.webhook.deliveries.length, deliveriesAfterFirst);
  assert.equal(harness.scheduler.size(), timersBefore + 3, 'no timers may be duplicated');
});

test('handover of an unknown parcel returns 404', async () => {
  const response = await request(harness.baseUrl, 'POST', '/parcels/UNKNOWN123/handover', { carrier: 'usps' });
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'PARCEL_NOT_FOUND');
});

test('scheduled events do not fire until the scheduler advances', async () => {
  const deliveries = harness.webhook.deliveries.length;
  assert.equal(harness.webhook.codes().includes('IN_TRANSIT'), false);
  assert.equal(harness.webhook.codes().includes('DELIVERED'), false);
  assert.equal(harness.webhook.deliveries.length, deliveries);
});
