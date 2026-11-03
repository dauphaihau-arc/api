import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeClock, request, startTestServer } from './helpers.mjs';

let harness;

test.before(async () => {
  harness = await startTestServer();
});

test.after(async () => {
  await harness.close();
});

test('scheduled emissions land at +60s, +300s and +420s from handover', async () => {
  const created = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'usps' });
  const trackingNumber = created.body.parcel.tracking_number;
  const handoverAt = harness.clock.now();

  await request(harness.baseUrl, 'POST', `/parcels/${trackingNumber}/handover`, { carrier: 'usps' });
  assert.deepEqual(harness.scheduler.pending(), [60000, 300000, 420000]);
  assert.deepEqual(harness.webhook.codes(), ['PICKED_UP']);

  harness.clock.advance(60000);
  await harness.scheduler.runByDelay(60000);
  assert.deepEqual(harness.webhook.codes(), ['PICKED_UP', 'IN_TRANSIT']);

  harness.clock.advance(240000);
  await harness.scheduler.runByDelay(300000);
  assert.deepEqual(harness.webhook.codes(), ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']);

  harness.clock.advance(120000);
  await harness.scheduler.runByDelay(420000);
  assert.deepEqual(harness.webhook.codes(), ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  assert.equal(harness.scheduler.size(), 0);

  const stored = await request(harness.baseUrl, 'GET', `/parcels/${trackingNumber}`);
  assert.deepEqual(
    stored.body.parcel.events.map((event) => event.event_code),
    ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  );
  assert.deepEqual(
    stored.body.parcel.events.map((event) => Date.parse(event.occurred_at) - handoverAt),
    [0, 60000, 300000, 420000],
  );
  for (const delivery of harness.webhook.deliveries) {
    assert.equal(delivery.signatureValid, true);
  }
});

test('timers are scheduled per parcel and cancelling one keeps the other scheduled', async () => {
  const first = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'dhl' });
  const second = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'dhl' });
  const firstTracking = first.body.parcel.tracking_number;
  const secondTracking = second.body.parcel.tracking_number;

  await request(harness.baseUrl, 'POST', `/parcels/${firstTracking}/handover`, { carrier: 'dhl' });
  await request(harness.baseUrl, 'POST', `/parcels/${secondTracking}/handover`, { carrier: 'dhl' });
  assert.equal(harness.scheduler.size(), 6);

  await request(harness.baseUrl, 'POST', `/parcels/${firstTracking}/advance`, { carrier: 'dhl' });
  assert.equal(harness.scheduler.size(), 3);

  const deliveriesBefore = harness.webhook.deliveries.length;
  await harness.scheduler.flush();

  const firstState = await request(harness.baseUrl, 'GET', `/parcels/${firstTracking}`);
  const secondState = await request(harness.baseUrl, 'GET', `/parcels/${secondTracking}`);
  assert.equal(firstState.body.parcel.auto, false);
  assert.deepEqual(
    firstState.body.parcel.events.map((event) => event.event_code),
    ['PICKED_UP', 'IN_TRANSIT'],
  );
  assert.equal(secondState.body.parcel.events.length, 4);
  assert.equal(harness.webhook.deliveries.length, deliveriesBefore + 3);
});

test('fire-and-forget timer delivery failures do not crash the service', async () => {
  const clock = createFakeClock();
  const failureHarness = await startTestServer({
    clock,
    service: { webhookUrl: 'http://127.0.0.1:1/v1/webhooks/carrier' },
  });
  try {
    const created = await request(failureHarness.baseUrl, 'POST', '/parcels', { carrier: 'vnpost' });
    const trackingNumber = created.body.parcel.tracking_number;
    const handover = await request(failureHarness.baseUrl, 'POST', `/parcels/${trackingNumber}/handover`, {
      carrier: 'vnpost',
    });
    assert.equal(handover.status, 202);

    await failureHarness.scheduler.flush();

    const stored = await request(failureHarness.baseUrl, 'GET', `/parcels/${trackingNumber}`);
    assert.equal(stored.status, 200);
    assert.equal(stored.body.parcel.events.length, 4);

    const health = await request(failureHarness.baseUrl, 'GET', '/health');
    assert.equal(health.status, 200);
  } finally {
    await failureHarness.close();
  }
});
