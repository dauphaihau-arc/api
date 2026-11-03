import { HttpError, readJsonBody, sendJson } from './http.mjs';

function decodePath(req) {
  const url = new URL(req.url ?? '/', 'http://mock-carrier.local');
  const segments = url.pathname.split('/').filter(Boolean);
  try {
    return segments.map((segment) => decodeURIComponent(segment));
  } catch {
    throw new HttpError(400, 'INVALID_PATH', 'Path contains an invalid percent-encoding.');
  }
}

/**
 * Maps HTTP requests to parcel operations. Handlers answer or throw HttpError;
 * the server owns the single error-to-response boundary.
 */
export function createRouter({ parcels, rates, labels }) {
  async function registerParcel(req, res) {
    const result = parcels.register(await readJsonBody(req));
    sendJson(res, result.status, { parcel: result.parcel });
  }

  async function quoteRates(req, res) {
    const body = await readJsonBody(req);
    sendJson(res, 200, rates.quote(body));
  }

  async function purchaseLabel(req, res) {
    const result = labels.purchase(await readJsonBody(req));
    sendJson(res, 201, { label: result.label });
  }

  async function refundLabel(req, res, labelId) {
    await readJsonBody(req);
    const result = labels.refund(labelId);
    sendJson(res, 200, { label: result.label });
  }

  async function handoverParcel(req, res, trackingNumber) {
    const body = await readJsonBody(req);
    const result = await parcels.handover(trackingNumber, body);
    sendJson(res, result.status, { parcel: result.parcel });
  }

  async function advanceParcel(req, res, trackingNumber) {
    const body = await readJsonBody(req);
    const result = await parcels.advance(trackingNumber, body);
    sendJson(res, result.status, { parcel: result.parcel, emitted: result.emitted });
  }

  function readParcel(res, trackingNumber) {
    const parcel = parcels.get(trackingNumber);
    if (!parcel) {
      throw new HttpError(404, 'PARCEL_NOT_FOUND', `No parcel with tracking number ${trackingNumber}.`);
    }
    sendJson(res, 200, { parcel });
  }

  return async function route(req, res) {
    const decoded = decodePath(req);

    if (decoded.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
    }

    if (decoded[0] === 'health') {
      if (decoded.length !== 1) throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
      if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET /health.');
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (decoded[0] === 'rates') {
      if (decoded.length !== 1) throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
      if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST /rates.');
      await quoteRates(req, res);
      return;
    }

    if (decoded[0] === 'labels') {
      if (decoded.length === 1) {
        if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST /labels.');
        await purchaseLabel(req, res);
        return;
      }

      if (decoded.length === 3 && decoded[2] === 'refund') {
        if (req.method !== 'POST') {
          throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST /labels/:label_id/refund.');
        }
        await refundLabel(req, res, decoded[1]);
        return;
      }

      throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
    }

    if (decoded[0] !== 'parcels') {
      throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
    }

    if (decoded.length === 1) {
      if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST /parcels.');
      await registerParcel(req, res);
      return;
    }

    const trackingNumber = decoded[1];

    if (decoded.length === 2) {
      if (req.method !== 'GET') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET /parcels/:tracking_number.');
      }
      readParcel(res, trackingNumber);
      return;
    }

    if (decoded.length === 3 && decoded[2] === 'handover') {
      if (req.method !== 'POST') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST /parcels/:tracking_number/handover.');
      }
      await handoverParcel(req, res, trackingNumber);
      return;
    }

    if (decoded.length === 3 && decoded[2] === 'advance') {
      if (req.method !== 'POST') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST /parcels/:tracking_number/advance.');
      }
      await advanceParcel(req, res, trackingNumber);
      return;
    }

    throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
  };
}
