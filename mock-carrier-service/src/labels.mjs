import { randomUUID } from 'node:crypto';
import { HttpError } from './http.mjs';
import { buildLabelPdf } from './pdf.mjs';

function invalidQuoteId(value) {
  return new HttpError(
    400,
    'INVALID_QUOTE_ID',
    `"quote_id" must be a quote id string such as "rq_..." (received ${JSON.stringify(value)}).`,
  );
}

function labelNotFound(labelId) {
  return new HttpError(404, 'LABEL_NOT_FOUND', `No label with id ${labelId}.`);
}

/**
 * Buys quoted rate options and refunds (voids) the resulting labels.
 *
 * A purchase consumes the quote, registers the parcel (so handover/advance work
 * immediately) and renders the label PDF. It never hands the parcel over and
 * emits no webhook: the journey only starts on
 * `POST /parcels/:tracking_number/handover`.
 *
 * The label store keeps every purchase and its status (`purchased` | `voided`).
 * Refunding an unused label marks it `voided` and removes its parcel so later
 * handover/advance fail; refunding an already-voided label is an idempotent
 * success. A label whose parcel emitted any scan is already in use and cannot
 * be refunded. Refunds never emit a webhook.
 */
export function createLabelService({ rates, parcels }) {
  /** label_id -> { label, status: 'purchased' | 'voided' } */
  const store = new Map();

  function purchase(body) {
    const quoteId = body?.quote_id;
    if (typeof quoteId !== 'string' || quoteId.trim() === '') {
      throw invalidQuoteId(quoteId);
    }

    const currency = body?.currency;
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw new HttpError(400, 'INVALID_CURRENCY', '"currency" must be a 3-letter uppercase ISO code.');
    }

    // Throws 404 QUOTE_NOT_FOUND / 410 QUOTE_EXPIRED / 409 QUOTE_ALREADY_USED.
    const quote = rates.lookup(quoteId);

    if (quote.currency !== currency) {
      throw new HttpError(
        409,
        'QUOTE_CURRENCY_MISMATCH',
        `Quote ${quoteId} is priced in ${quote.currency}, not ${currency}.`,
      );
    }

    // Registering here generates the carrier-formatted tracking number and
    // retries on the (theoretical) clash; the parcel starts unhanded with no
    // events. `register` can only fail for an unsupported carrier, which a
    // stored quote never is.
    const { parcel } = parcels.register({ carrier: quote.carrier });
    rates.markUsed(quoteId);

    const labelId = `lbl_${randomUUID()}`;
    const label = {
      label_id: labelId,
      quote_id: quote.quote_id,
      carrier: quote.carrier,
      service: quote.service,
      tracking_number: parcel.tracking_number,
      price_minor: quote.price_minor,
      currency: quote.currency,
      pdf_base64: buildLabelPdf({
        label_id: labelId,
        carrier: quote.carrier,
        service: quote.service,
        tracking_number: parcel.tracking_number,
        price_minor: quote.price_minor,
        currency: quote.currency,
      }).toString('base64'),
    };

    store.set(labelId, { label, status: 'purchased' });

    return { status: 201, label };
  }

  function refund(labelId) {
    const record = store.get(labelId);
    if (!record) throw labelNotFound(labelId);

    const voided = { label_id: record.label.label_id, status: 'voided' };
    if (record.status === 'voided') return { label: voided };

    // The first carrier scan means the label was used; it cannot be refunded.
    if (parcels.hasEvents(record.label.tracking_number)) {
      throw new HttpError(
        409,
        'LABEL_ALREADY_USED',
        `Label ${labelId} already has a carrier scan and cannot be refunded.`,
      );
    }

    parcels.retire(record.label.tracking_number);
    record.status = 'voided';

    return { label: voided };
  }

  function get(labelId) {
    const record = store.get(labelId);
    return record ? { label_id: record.label.label_id, status: record.status } : null;
  }

  function count() {
    return store.size;
  }

  return { purchase, refund, get, count };
}
