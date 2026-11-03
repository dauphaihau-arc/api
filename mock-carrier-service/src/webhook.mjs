import { createHmac } from 'node:crypto';

/** Signs and posts one emitted scan to the API webhook. Never throws. */
export function createWebhookDelivery({
  webhookUrl,
  webhookSecret,
  fetchImpl,
  timeoutMs,
  logError,
}) {
  function buildBody(parcel, event) {
    return JSON.stringify({
      event_id: event.event_id,
      carrier: parcel.carrier,
      tracking_number: parcel.tracking_number,
      event_code: event.event_code,
      location: event.location,
      occurred_at: event.occurred_at,
    });
  }

  return async function deliver(parcel, event) {
    const body = buildBody(parcel, event);
    const signature = `sha256=${createHmac('sha256', webhookSecret).update(body, 'utf8').digest('hex')}`;
    try {
      const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-carrier-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        logError(
          `webhook delivery for ${event.event_id} rejected`,
          new Error(`HTTP ${response.status}`),
        );
      }
    } catch (error) {
      logError(`webhook delivery for ${event.event_id} failed`, error);
    }
  };
}
