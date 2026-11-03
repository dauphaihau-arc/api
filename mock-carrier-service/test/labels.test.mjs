import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CARRIER_PATTERNS, RATE_QUOTE_TTL_MS } from '../src/constants.mjs';
import { createRateService } from '../src/rates.mjs';
import { createFakeClock, request, startTestServer } from './helpers.mjs';

const PACKAGE = {
  weight_grams: 1000,
  length_cm: 10,
  width_cm: 10,
  height_cm: 10,
  currency: 'USD',
};

const QUOTE_ID_PATTERN = /^rq_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LABEL_ID_PATTERN = /^lbl_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let harness;

test.before(async () => {
  harness = await startTestServer();
});

test.after(async () => {
  await harness.close();
});

async function quote() {
  const response = await request(harness.baseUrl, 'POST', '/rates', PACKAGE);
  assert.equal(response.status, 200);
  return response.body.rates;
}

function pick(rates, carrier = 'usps', service = 'standard') {
  const rate = rates.find((entry) => entry.carrier === carrier && entry.service === service);
  assert.ok(rate, `missing ${carrier}/${service} quote`);
  return rate;
}

function buy(quoteId, currency = 'USD') {
  return request(harness.baseUrl, 'POST', '/labels', { quote_id: quoteId, currency });
}

test('buys a quote: 201 label with PDF, tracking number and registered parcel', async () => {
  const parcelsBefore = harness.service.parcelCount();
  const deliveriesBefore = harness.webhook.deliveries.length;
  const quotesBefore = harness.service.rates.quoteCount();

  const rates = await quote();
  assert.equal(harness.service.rates.quoteCount(), quotesBefore + 6);
  assert.equal(harness.service.parcelCount(), parcelsBefore, 'quoting registers no parcel');

  const option = pick(rates);
  const response = await buy(option.quote_id);
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(response.body), ['label']);

  const { label } = response.body;
  assert.deepEqual(Object.keys(label), [
    'label_id',
    'quote_id',
    'carrier',
    'service',
    'tracking_number',
    'price_minor',
    'currency',
    'pdf_base64',
  ]);
  assert.match(label.label_id, LABEL_ID_PATTERN);
  assert.equal(label.quote_id, option.quote_id);
  assert.equal(label.carrier, option.carrier);
  assert.equal(label.service, option.service);
  assert.equal(label.price_minor, option.price_minor);
  assert.equal(label.currency, option.currency);
  assert.match(label.tracking_number, CARRIER_PATTERNS[option.carrier]);
  assert.equal(typeof label.pdf_base64, 'string');

  const pdf = Buffer.from(label.pdf_base64, 'base64');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.equal(pdf.subarray(-6).toString().trim(), '%%EOF');

  const pdfText = pdf.toString('latin1');
  assert.ok(pdfText.includes(`Label: ${label.label_id}`), 'PDF names the label id');
  assert.ok(pdfText.includes(`Carrier: ${label.carrier}`), 'PDF names the carrier');
  assert.ok(pdfText.includes(`Service: ${label.service}`), 'PDF names the service');
  assert.ok(pdfText.includes(`Tracking: ${label.tracking_number}`), 'PDF names the tracking number');
  assert.ok(
    pdfText.includes(`Price: ${label.price_minor} ${label.currency}`),
    'PDF names the price',
  );

  // The purchase registered exactly one parcel, not handed over and eventless.
  assert.equal(harness.service.parcelCount(), parcelsBefore + 1);
  const parcelResponse = await request(
    harness.baseUrl,
    'GET',
    `/parcels/${label.tracking_number}`,
  );
  assert.equal(parcelResponse.status, 200);
  const { parcel } = parcelResponse.body;
  assert.equal(parcel.carrier, option.carrier);
  assert.equal(parcel.tracking_number, label.tracking_number);
  assert.equal(parcel.handed_over_at, null);
  assert.equal(parcel.auto, false);
  assert.deepEqual(parcel.events, []);

  // No scan and therefore no webhook at purchase time.
  assert.equal(harness.webhook.deliveries.length, deliveriesBefore);
});

test('a purchased parcel can be handed over and advanced immediately', async () => {
  const rates = await quote();
  const option = pick(rates, 'dhl', 'express');
  const purchase = await buy(option.quote_id);
  assert.equal(purchase.status, 201);

  const { tracking_number: trackingNumber } = purchase.body.label;
  const handover = await request(
    harness.baseUrl,
    'POST',
    `/parcels/${trackingNumber}/handover`,
    { carrier: 'dhl' },
  );
  assert.equal(handover.status, 202);
  assert.deepEqual(handover.body.parcel.events.map((event) => event.event_code), ['PICKED_UP']);

  const advance = await request(
    harness.baseUrl,
    'POST',
    `/parcels/${trackingNumber}/advance`,
    { carrier: 'dhl' },
  );
  assert.equal(advance.status, 200);
  assert.equal(advance.body.emitted.event_code, 'IN_TRANSIT');
});

test('unknown quote ids are 404 QUOTE_NOT_FOUND', async () => {
  const parcelsBefore = harness.service.parcelCount();
  const response = await buy(`rq_${randomUUID()}`);
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'QUOTE_NOT_FOUND');
  assert.equal(harness.service.parcelCount(), parcelsBefore);
});

test('expired quotes are 410 QUOTE_EXPIRED and register nothing', async () => {
  const rates = await quote();
  const option = pick(rates, 'vnpost', 'standard');
  harness.clock.advance(RATE_QUOTE_TTL_MS + 1);
  const parcelsBefore = harness.service.parcelCount();

  const response = await buy(option.quote_id);
  assert.equal(response.status, 410);
  assert.equal(response.body.code, 'QUOTE_EXPIRED');
  assert.equal(harness.service.parcelCount(), parcelsBefore);
});

test('a label purchase is bound to the quote currency', async () => {
  const rates = await quote();
  const option = pick(rates);

  const wrong = await buy(option.quote_id, 'EUR');
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.code, 'QUOTE_CURRENCY_MISMATCH');

  const missing = await request(harness.baseUrl, 'POST', '/labels', { quote_id: option.quote_id });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, 'INVALID_CURRENCY');

  // The refused attempts did not consume the quote.
  const correct = await buy(option.quote_id, 'USD');
  assert.equal(correct.status, 201);
});

test('a quote is single use: the second purchase is 409 QUOTE_ALREADY_USED', async () => {
  const rates = await quote();
  const option = pick(rates, 'usps', 'express');

  const first = await buy(option.quote_id);
  assert.equal(first.status, 201);
  const parcelsAfterFirst = harness.service.parcelCount();

  const second = await buy(option.quote_id);
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'QUOTE_ALREADY_USED');
  assert.equal(harness.service.parcelCount(), parcelsAfterFirst, 'no extra parcel on 409');
});

test('label ids and tracking numbers are unique per purchase', async () => {
  const rates = await quote();
  const [firstOption, secondOption] = rates.filter((rate) => rate.carrier === 'usps');

  const first = await buy(firstOption.quote_id);
  const second = await buy(secondOption.quote_id);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  assert.match(first.body.label.label_id, LABEL_ID_PATTERN);
  assert.match(second.body.label.label_id, LABEL_ID_PATTERN);
  assert.notEqual(first.body.label.label_id, second.body.label.label_id);
  assert.notEqual(first.body.label.tracking_number, second.body.label.tracking_number);
  assert.notEqual(first.body.label.pdf_base64, second.body.label.pdf_base64);
});

test('quote ids are only purchasable through POST /labels', async () => {
  const get = await request(harness.baseUrl, 'GET', '/labels');
  assert.equal(get.status, 405);
  assert.equal(get.body.code, 'METHOD_NOT_ALLOWED');

  const nested = await request(harness.baseUrl, 'POST', '/labels/extra', { quote_id: 'rq_x' });
  assert.equal(nested.status, 404);
  assert.equal(nested.body.code, 'NOT_FOUND');
});

test('rejects missing or malformed quote_id with 400 INVALID_QUOTE_ID', async () => {
  for (const body of [{}, { quote_id: null }, { quote_id: 42 }, { quote_id: '' }, { quote_id: '  ' }]) {
    const response = await request(harness.baseUrl, 'POST', '/labels', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(response.body.code, 'INVALID_QUOTE_ID', JSON.stringify(body));
  }
});

test('quote store keeps every option until TTL, then rejects and tracks use', () => {
  const clock = createFakeClock();
  const rates = createRateService({ now: clock.now });

  const { rates: options } = rates.quote(PACKAGE);
  assert.equal(rates.quoteCount(), 6);
  for (const option of options) assert.match(option.quote_id, QUOTE_ID_PATTERN);

  const [option] = options;
  const lookup = rates.lookup(option.quote_id);
  assert.equal(lookup.quote_id, option.quote_id);
  assert.equal(lookup.carrier, option.carrier);
  assert.equal(lookup.price_minor, option.price_minor);
  rates.markUsed(option.quote_id);
  assert.throws(() => rates.lookup(option.quote_id), {
    status: 409,
    code: 'QUOTE_ALREADY_USED',
  });

  const second = rates.quote(PACKAGE);
  // Exactly at the TTL boundary the quote is still purchasable (strict `>`).
  clock.advance(RATE_QUOTE_TTL_MS);
  assert.doesNotThrow(() => rates.lookup(second.rates[0].quote_id));
  clock.advance(1);
  assert.throws(() => rates.lookup(second.rates[0].quote_id), {
    status: 410,
    code: 'QUOTE_EXPIRED',
  });

  assert.throws(() => rates.lookup('rq_unknown'), { status: 404, code: 'QUOTE_NOT_FOUND' });
  assert.equal(rates.quoteCount(), 12);
});

async function buyLabel(carrier = 'usps', service = 'standard') {
  const rates = await quote();
  const option = pick(rates, carrier, service);
  const purchase = await buy(option.quote_id);
  assert.equal(purchase.status, 201);
  return purchase.body.label;
}

function refund(labelId) {
  return request(harness.baseUrl, 'POST', `/labels/${labelId}/refund`, {});
}

test('refund before any scan voids the label, retires the parcel and emits no webhook', async () => {
  const label = await buyLabel();
  const deliveriesBefore = harness.webhook.deliveries.length;
  const parcelsBefore = harness.service.parcelCount();

  assert.deepEqual(harness.service.labels.get(label.label_id), {
    label_id: label.label_id,
    status: 'purchased',
  });

  const response = await refund(label.label_id);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    label: { label_id: label.label_id, status: 'voided' },
  });

  const stored = harness.service.labels.get(label.label_id);
  assert.deepEqual(stored, { label_id: label.label_id, status: 'voided' });
  assert.equal(harness.service.parcelCount(), parcelsBefore - 1);

  // The retired parcel no longer serves the journey endpoints.
  const handover = await request(
    harness.baseUrl,
    'POST',
    `/parcels/${label.tracking_number}/handover`,
    { carrier: label.carrier },
  );
  assert.equal(handover.status, 404);
  assert.equal(handover.body.code, 'PARCEL_NOT_FOUND');

  const advance = await request(
    harness.baseUrl,
    'POST',
    `/parcels/${label.tracking_number}/advance`,
    { carrier: label.carrier },
  );
  assert.equal(advance.status, 404);
  assert.equal(advance.body.code, 'PARCEL_NOT_FOUND');

  const read = await request(harness.baseUrl, 'GET', `/parcels/${label.tracking_number}`);
  assert.equal(read.status, 404);

  // No scan happened, so refund itself sent nothing.
  assert.equal(harness.webhook.deliveries.length, deliveriesBefore);
});

test('refund after a carrier scan is 409 LABEL_ALREADY_USED and keeps the parcel', async () => {
  const label = await buyLabel('dhl', 'express');
  const handover = await request(
    harness.baseUrl,
    'POST',
    `/parcels/${label.tracking_number}/handover`,
    { carrier: 'dhl' },
  );
  assert.equal(handover.status, 202);
  assert.deepEqual(handover.body.parcel.events.map((event) => event.event_code), ['PICKED_UP']);
  const deliveriesBefore = harness.webhook.deliveries.length;

  const response = await refund(label.label_id);
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'LABEL_ALREADY_USED');

  assert.deepEqual(harness.service.labels.get(label.label_id), {
    label_id: label.label_id,
    status: 'purchased',
  });

  const parcelResponse = await request(
    harness.baseUrl,
    'GET',
    `/parcels/${label.tracking_number}`,
  );
  assert.equal(parcelResponse.status, 200);
  assert.equal(parcelResponse.body.parcel.events.length, 1);

  assert.equal(harness.webhook.deliveries.length, deliveriesBefore, 'refund emits no webhook');
});

test('unknown labels are 404 LABEL_NOT_FOUND and emit no webhook', async () => {
  const deliveriesBefore = harness.webhook.deliveries.length;
  const response = await refund(`lbl_${randomUUID()}`);
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'LABEL_NOT_FOUND');
  assert.equal(harness.webhook.deliveries.length, deliveriesBefore);
});

test('repeated refund is 200 idempotent and never touches the webhook', async () => {
  const label = await buyLabel('vnpost', 'standard');
  const deliveriesBefore = harness.webhook.deliveries.length;
  const parcelsAfterRefund = harness.service.parcelCount() - 1;

  const first = await refund(label.label_id);
  assert.equal(first.status, 200);
  assert.equal(harness.service.parcelCount(), parcelsAfterRefund);

  const second = await refund(label.label_id);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.deepEqual(second.body, { label: { label_id: label.label_id, status: 'voided' } });
  assert.equal(harness.service.parcelCount(), parcelsAfterRefund);
  assert.equal(harness.webhook.deliveries.length, deliveriesBefore);
});

test('refund is only reachable as POST /labels/:label_id/refund', async () => {
  const label = await buyLabel();

  const get = await request(harness.baseUrl, 'GET', `/labels/${label.label_id}/refund`);
  assert.equal(get.status, 405);
  assert.equal(get.body.code, 'METHOD_NOT_ALLOWED');

  const nested = await request(
    harness.baseUrl,
    'POST',
    `/labels/${label.label_id}/refund/extra`,
    {},
  );
  assert.equal(nested.status, 404);
  assert.equal(nested.body.code, 'NOT_FOUND');

  // The valid call still works and the label store tracks it.
  const refunded = await refund(label.label_id);
  assert.equal(refunded.status, 200);
  assert.equal(harness.service.labels.get(label.label_id).status, 'voided');
  assert.ok(harness.service.labelCount() >= 1);
});
