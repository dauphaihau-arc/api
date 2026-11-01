#!/usr/bin/env node
// Generates the per-run carrier fixtures: USPS and DHL tracking numbers, real
// event ids, the signed bodies, and a variables file for the manual Hurl files.
//
// Hurl cannot compute HMAC, and reusing a tracking number or event id across
// runs would route the event to a previous Shipment or be dropped as a
// duplicate. This script is the smallest way to keep both unique per run.
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const carryingDirectory = dirname(fileURLToPath(import.meta.url));
const variablesPath = '/tmp/arc-carrier-pickup.variables';

const secret = process.env.CARRIER_WEBHOOK_SECRET ?? 'carrier-webhook-test-secret';

const digits = (length) => Array.from({ length }, () => String(randomInt(0, 10))).join('');

// USPS is 22 digits starting with 9 (`^9\d{21}$`); DHL is 10 digits.
const uspsTrackingNumber = `9${digits(21)}`;
const dhlTrackingNumber = digits(10);
const voidedTrackingNumber = `9${digits(21)}`;

const startedAt = Date.now();
const tick = 1_000;

const pickupEventId = `evt-pickup-${randomUUID()}`;

// Events are ordered after each other so the timeline reads as a journey. The
// status rank is what actually moves the Shipment; these times only order it.
const events = [
  { file: 'pickup.body', variable: 'sig_pickup', code: 'PICKED_UP', carrier: 'usps', tracking: uspsTrackingNumber, location: 'Portland, OR', offset: 0, eventId: pickupEventId },
  { file: 'transit.body', variable: 'sig_transit', code: 'IN_TRANSIT', carrier: 'usps', tracking: uspsTrackingNumber, location: 'Salem, OR', offset: tick },
  { file: 'ofd.body', variable: 'sig_ofd', code: 'OUT_FOR_DELIVERY', carrier: 'usps', tracking: uspsTrackingNumber, location: 'Beaverton, OR', offset: 2 * tick },
  { file: 'delivered.body', variable: 'sig_delivered', code: 'DELIVERED', carrier: 'usps', tracking: uspsTrackingNumber, location: 'Portland, OR', offset: 3 * tick },
  // The same event id as the USPS pickup, reported by a different carrier: dedupe
  // is per (carrier, event_id), so this must still be recorded.
  { file: 'shared-dhl.body', variable: 'sig_shared_dhl', code: 'PICKED_UP', carrier: 'dhl', tracking: dhlTrackingNumber, location: 'Hanoi, VN', offset: 4 * tick, eventId: pickupEventId },
  // Targets a Shipment the case voids before sending: the event must be ignored.
  { file: 'voided-pickup.body', variable: 'sig_voided_pickup', code: 'PICKED_UP', carrier: 'usps', tracking: voidedTrackingNumber, location: 'Portland, OR', offset: 5 * tick },
  // Occurs before the delivery it arrives after: stored, but must not regress.
  { file: 'stale-transit.body', variable: 'sig_stale_transit', code: 'IN_TRANSIT', carrier: 'usps', tracking: uspsTrackingNumber, location: 'Eugene, OR', offset: 500 },
  // Exception evidence: recorded on the timeline without advancing the journey.
  { file: 'delivery-failed.body', variable: 'sig_delivery_failed', code: 'DELIVERY_FAILED', carrier: 'usps', tracking: uspsTrackingNumber, location: 'Gresham, OR', offset: 6 * tick },
  { file: 'returned.body', variable: 'sig_returned', code: 'RETURNED', carrier: 'usps', tracking: uspsTrackingNumber, location: 'Vancouver, WA', offset: 7 * tick },
];

const generatedVariables = [
  `carrier_pickup_tracking=${uspsTrackingNumber}`,
  `carrier_cross_dhl_tracking=${dhlTrackingNumber}`,
  `carrier_voided_tracking=${voidedTrackingNumber}`,
  `carrier_cash_buyer_email=carrier-cash-${randomUUID()}@example.com`,
  `carrier_voided_buyer_email=carrier-voided-${randomUUID()}@example.com`,
];

for (const event of events) {
  const body = {
    event_id: event.eventId ?? `evt-${event.code.toLowerCase()}-${randomUUID()}`,
    carrier: event.carrier,
    tracking_number: event.tracking,
    event_code: event.code,
    location: event.location,
    occurred_at: new Date(startedAt + event.offset).toISOString(),
  };

  const bodyPath = join(carryingDirectory, 'bodies', event.file);
  writeFileSync(bodyPath, `${JSON.stringify(body)}\n`);

  const signature = createHmac('sha256', secret)
    .update(readFileSync(bodyPath))
    .digest('hex');

  generatedVariables.push(`carrier_signature_${event.variable.replace(/^sig_/, '')}=${signature}`);
  console.log(`${event.code.padEnd(16)} ${event.carrier.padEnd(5)} ${bodyPath}`);
  console.log(`${''.padEnd(22)} ${body.event_id} ${signature}`);
}

const baseVariables = readFileSync(join(carryingDirectory, '..', '..', 'hurl.variables'), 'utf8');
writeFileSync(
  variablesPath,
  `${baseVariables.trimEnd()}\n${generatedVariables.join('\n')}\n`,
);

console.log(`variables: ${variablesPath}`);
console.log(`usps:      ${uspsTrackingNumber}`);
console.log(`dhl:       ${dhlTrackingNumber}`);
