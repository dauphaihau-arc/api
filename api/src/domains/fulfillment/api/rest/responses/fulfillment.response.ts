import type { FulfillmentAggregateStatus } from '../../../domain/enums/fulfillment-aggregate-status.enum';
import type { FulfillmentProgressSnapshot } from '../../../domain/fulfillment-progress';
import type {
  FulfillmentOrderView,
  FulfillmentShipmentView,
} from '../../../app/fulfillment.types';
import type { OrderLegacyShippingEvidence } from '../../../app/ports/order-fulfillment-context.port';

function serializeProgress(progress: FulfillmentProgressSnapshot) {
  return {
    ordered: progress.ordered,
    prepared: progress.prepared,
    dispatched: progress.dispatched,
    delivered: progress.delivered,
    canceled: progress.canceled,
    outstanding: progress.outstanding,
  };
}

function serializeShipment(shipment: FulfillmentShipmentView) {
  return {
    id: shipment.publicId,
    group_id: shipment.groupId,
    status: shipment.status,
    carrier: shipment.carrier,
    tracking_number: shipment.trackingNumber,
    shipment_note: shipment.note,
    origin_countries: shipment.originCountries,
    prepared_at: shipment.preparedAt,
    dispatched_at: shipment.dispatchedAt,
    delivered_at: shipment.deliveredAt,
    voided_at: shipment.voidedAt,
    created_at: shipment.createdAt,
    updated_at: shipment.updatedAt,
    items: shipment.items.map((item) => ({
      order_item_id: item.orderItemId,
      quantity: item.quantity,
    })),
    updates: shipment.updates.map((update) => ({
      id: update.id,
      status: update.status,
      actor_type: update.actorType,
      actor_id: update.actorId,
      source: update.source,
      occurred_at: update.occurredAt,
      note: update.note,
    })),
  };
}

export function toFulfillmentOrderResponse(input: {
  view: FulfillmentOrderView;
  status: FulfillmentAggregateStatus;
  requiresReconciliation: boolean;
  legacyShipping: OrderLegacyShippingEvidence;
}) {
  return {
    status: input.status,
    requires_reconciliation: input.requiresReconciliation,
    progress: serializeProgress(input.view.progress),
    legacy_shipping: {
      status: input.legacyShipping.status,
      updated_at: input.legacyShipping.updatedAt,
      to_country: input.legacyShipping.toCountry,
      from_countries: input.legacyShipping.fromCountries,
      estimated_delivery: input.legacyShipping.estimatedDelivery,
      tracking_number: input.legacyShipping.trackingNumber,
      carrier: input.legacyShipping.carrier,
      note: input.legacyShipping.note,
      shipped_at: input.legacyShipping.shippedAt,
      delivered_at: input.legacyShipping.deliveredAt,
    },
    groups: input.view.groups.map((group) => ({
      id: group.id,
      method: group.method,
      operator: group.operator,
      provenance: group.provenance,
      items: group.items.map((item) => ({
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      })),
      progress: serializeProgress(group.progress),
      shipments: group.shipments.map(serializeShipment),
    })),
  };
}
