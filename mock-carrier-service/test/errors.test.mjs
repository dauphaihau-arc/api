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

test('unknown routes return a JSON 404', async () => {
  const response = await request(harness.baseUrl, 'GET', '/nope');
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'NOT_FOUND');
});

test('unsupported methods return 405', async () => {
  const response = await request(harness.baseUrl, 'GET', '/parcels');
  assert.equal(response.status, 405);
  assert.equal(response.body.code, 'METHOD_NOT_ALLOWED');
});

test('malformed JSON bodies return 400', async () => {
  const response = await request(harness.baseUrl, 'POST', '/parcels', '{"carrier":');
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_JSON');
});

test('non-object JSON bodies return 400', async () => {
  for (const body of ['[]', '"usps"', 'null']) {
    const response = await request(harness.baseUrl, 'POST', '/parcels', body);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'INVALID_BODY');
  }
});

test('unsupported carrier on handover and advance returns 422', async () => {
  const created = await request(harness.baseUrl, 'POST', '/parcels', { carrier: 'usps' });
  const trackingNumber = created.body.parcel.tracking_number;

  const handover = await request(harness.baseUrl, 'POST', `/parcels/${trackingNumber}/handover`, {
    carrier: 'other',
  });
  assert.equal(handover.status, 422);
  assert.equal(handover.body.code, 'UNSUPPORTED_CARRIER');

  const advance = await request(harness.baseUrl, 'POST', `/parcels/${trackingNumber}/advance`, {
    carrier: 'other',
  });
  assert.equal(advance.status, 422);
  assert.equal(advance.body.code, 'UNSUPPORTED_CARRIER');
});

test('unreachable webhook does not crash the service', async () => {
  const failureHarness = await startTestServer({
    service: { webhookUrl: 'http://127.0.0.1:1/v1/webhooks/carrier' },
  });
  try {
    const created = await request(failureHarness.baseUrl, 'POST', '/parcels', { carrier: 'usps' });
    const trackingNumber = created.body.parcel.tracking_number;

    const handover = await request(failureHarness.baseUrl, 'POST', `/parcels/${trackingNumber}/handover`, {
      carrier: 'usps',
    });
    assert.equal(handover.status, 202);

    const advance = await request(failureHarness.baseUrl, 'POST', `/parcels/${trackingNumber}/advance`, {
      carrier: 'usps',
    });
    assert.equal(advance.status, 200);
    assert.equal(advance.body.emitted.event_code, 'IN_TRANSIT');

    const stored = await request(failureHarness.baseUrl, 'GET', `/parcels/${trackingNumber}`);
    assert.equal(stored.status, 200);
  } finally {
    await failureHarness.close();
  }
});
