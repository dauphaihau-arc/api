export const ORDER_DELIVERED_OUTBOX_EVENT_NAME = 'order.delivered';
export const ORDER_DELIVERED_OUTBOX_AGGREGATE_TYPE = 'order';

/**
 * The delivery evidence one Shipment contributes to its Order's delivery
 * event: the Shipment's identity and the instant its units were delivered.
 */
export interface OrderDeliveredShipmentEvidenceInput {
  shipmentId: string;
  shipmentPublicId: string;
  deliveredAt: Date;
}

/**
 * The delivery fact an Order carries into its money event: the Order's
 * identity, the instant its last required unit was delivered, and the
 * Shipment evidence the delivery was established from.
 */
export interface OrderDeliveredEventInput {
  orderId: string;
  deliveredAt: Date;
  occurredAt: Date;
  evidence: OrderDeliveredShipmentEvidenceInput[];
}

/** The same evidence as the outbox payload, with the instant serialised. */
export interface OrderDeliveredShipmentEvidencePayload
  extends Omit<OrderDeliveredShipmentEvidenceInput, 'deliveredAt'> {
  deliveredAt: string;
}

/** The same facts as the outbox payload, with the instants serialised. */
export interface OrderDeliveredEventPayload
  extends Omit<OrderDeliveredEventInput, 'deliveredAt' | 'occurredAt' | 'evidence'> {
  deliveredAt: string;
  occurredAt: string;
  evidence: OrderDeliveredShipmentEvidencePayload[];
}

export function buildOrderDeliveredEvent(
  input: OrderDeliveredEventInput,
): OrderDeliveredEventPayload {
  return {
    orderId: input.orderId,
    deliveredAt: input.deliveredAt.toISOString(),
    occurredAt: input.occurredAt.toISOString(),
    evidence: input.evidence.map((evidence) => ({
      shipmentId: evidence.shipmentId,
      shipmentPublicId: evidence.shipmentPublicId,
      deliveredAt: evidence.deliveredAt.toISOString(),
    })),
  };
}
