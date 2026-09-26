import { FulfillmentAggregateStatus } from './enums/fulfillment-aggregate-status.enum';
import { ShipmentStatus } from './enums/shipment-status.enum';

export type ShipmentQuantityState = {
  status: ShipmentStatus;
  items: Array<{ orderItemId: string; quantity: number }>;
};

export type FulfillmentProgressSnapshot = {
  ordered: number;
  prepared: number;
  dispatched: number;
  delivered: number;
  canceled: number;
  outstanding: number;
};

/**
 * Quantity roll-up over grouped consignments. `dispatched` includes in-transit and
 * delivered quantities, so journey totals are not disjoint unit counts.
 * `canceled` is a whole-Order fact (this release has no partial cancellation), so
 * it is supplied by the Order rather than the Shipment collection. `outstanding`
 * is the remaining obligation: ordered minus dispatched and canceled units, never
 * a sum of the overlapping journey totals.
 */
export function computeFulfillmentProgress(
  orderedQuantity: number,
  shipments: ShipmentQuantityState[],
  canceledQuantity = 0,
): FulfillmentProgressSnapshot {
  let prepared = 0;
  let dispatched = 0;
  let delivered = 0;

  for (const shipment of shipments) {
    const quantity = shipment.items.reduce((total, item) => total + item.quantity, 0);

    switch (shipment.status) {
      case ShipmentStatus.PREPARED:
        prepared += quantity;
        break;
      case ShipmentStatus.DISPATCHED:
        dispatched += quantity;
        break;
      case ShipmentStatus.IN_TRANSIT:
        dispatched += quantity;
        break;
      case ShipmentStatus.DELIVERED:
        dispatched += quantity;
        delivered += quantity;
        break;
      case ShipmentStatus.VOIDED:
        break;
    }
  }

  return {
    ordered: orderedQuantity,
    prepared,
    dispatched,
    delivered,
    canceled: canceledQuantity,
    outstanding: Math.max(0, orderedQuantity - dispatched - canceledQuantity),
  };
}

/**
 * Aggregate status for one Order, derived from its fulfillment collection.
 * Orders without a group report `unfulfilled`; pre-cutover Order-level shipping
 * evidence is carried separately as legacy history, never as an aggregate value.
 *
 * Quantity-based priority: all canceled; all required quantities delivered; some
 * delivered; all required dispatched; some dispatched; preparing. In-transit
 * quantities count as dispatched, so they are reported as shipped rather than a
 * separate transit state.
 */
export function computeAggregateStatus(input: {
  orderedQuantity: number;
  progress: FulfillmentProgressSnapshot;
  hasGroups: boolean;
  isCanceled: boolean;
}): FulfillmentAggregateStatus {
  if (input.isCanceled) {
    return FulfillmentAggregateStatus.CANCELED;
  }

  if (!input.hasGroups) {
    return FulfillmentAggregateStatus.UNFULFILLED;
  }

  const required = input.orderedQuantity;

  if (required > 0 && input.progress.delivered >= required) {
    return FulfillmentAggregateStatus.DELIVERED;
  }

  if (input.progress.delivered > 0) {
    return FulfillmentAggregateStatus.PARTIALLY_DELIVERED;
  }

  if (required > 0 && input.progress.dispatched >= required) {
    return FulfillmentAggregateStatus.SHIPPED;
  }

  if (input.progress.dispatched > 0) {
    return FulfillmentAggregateStatus.PARTIALLY_SHIPPED;
  }

  if (input.progress.prepared > 0) {
    return FulfillmentAggregateStatus.PREPARED;
  }

  return FulfillmentAggregateStatus.UNFULFILLED;
}
