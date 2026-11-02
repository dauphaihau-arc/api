import type { CarrierEventCode } from '../../domain/carrier-event';

/**
 * One accepted carrier event, emitted after its evidence is committed. The
 * Order domain consumes it to tell both parties about a handover or delivery
 * without fulfillment importing notification.
 */
export const SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT =
  'fulfillment.shipment.carrier-event-accepted';

export type ShipmentCarrierEventAcceptedPayload = {
  orderId: string;
  shopId: string;
  eventCode: CarrierEventCode;
  carrier: string;
  trackingNumber: string;
  occurredAt: Date;
};
