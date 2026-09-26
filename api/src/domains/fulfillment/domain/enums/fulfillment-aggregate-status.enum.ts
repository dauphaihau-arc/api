/**
 * Aggregate, collection-level fulfillment status for one Order.
 *
 * This is deliberately separate from an individual Shipment's journey status: it
 * summarises grouped consignments by quantity and never replaces per-Shipment
 * detail. `DISPATCHED`/`IN_TRANSIT` are retained for the legacy order-level
 * projection only; quantity-based progress folds in-transit quantities into
 * dispatched (`PARTIALLY_SHIPPED`/`SHIPPED`).
 */
export enum FulfillmentAggregateStatus {
  UNFULFILLED = 'unfulfilled',
  PREPARED = 'prepared',
  PARTIALLY_SHIPPED = 'partially_shipped',
  SHIPPED = 'shipped',
  PARTIALLY_DELIVERED = 'partially_delivered',
  DELIVERED = 'delivered',
  CANCELED = 'canceled',
  /** Legacy projection value only: some quantities dispatched before transit tracking. */
  DISPATCHED = 'dispatched',
  /** Legacy projection value only: order-level in-transit evidence. */
  IN_TRANSIT = 'in_transit',
}
