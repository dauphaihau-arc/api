import { computeAggregateStatus } from '../../fulfillment/domain/fulfillment-progress';
import { emptyFulfillmentOrderView } from '../../fulfillment/app/fulfillment-view.factory';
import type { FulfillmentOrderView } from '../../fulfillment/app/fulfillment.types';
import type { FulfillmentAggregateStatus } from '../../fulfillment/domain/enums/fulfillment-aggregate-status.enum';
import { OrderStatus } from '../domain/enums/order-status.enum';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type {
  LegacyOrderShippingEvidence,
  OrderFulfillmentSummary,
} from './order.types';

const RECONCILABLE_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.PENDING,
  OrderStatus.PAID,
]);

/**
 * Orders whose commercial cancellation makes every assigned unit canceled. Passed
 * to the fulfillment view loader so quantity progress reports the remaining
 * obligation as zero instead of counting canceled units as outstanding.
 */
export function canceledFulfillmentOrderIds(
  orders: ReadonlyArray<Pick<OrderEntity, 'id' | 'status'>>,
): string[] {
  return orders
    .filter((order) => order.status === OrderStatus.CANCELED)
    .map((order) => order.id);
}

export function toLegacyOrderShippingEvidence(
  order: OrderEntity,
): LegacyOrderShippingEvidence {
  return {
    status: order.shippingStatus,
    // Order-level legacy evidence is immutable history: never expose the mutable
    // row updated_at as a shipping timestamp.
    updatedAt: order.deliveredAt ?? order.shippedAt ?? order.createdAt,
    toCountry: order.shippingToCountry,
    fromCountries: order.shippingOriginCountries,
    estimatedDelivery: order.shippingEstimatedDelivery,
    trackingNumber: order.trackingNumber,
    carrier: order.shippingCarrier,
    note: order.shipmentNote,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
  };
}

/**
 * Combines the fulfillment collection view with the Order's commercial state.
 * Legacy order-level shipping is only reported as evidence, never as the
 * authoritative collection.
 */
export function buildOrderFulfillmentSummary(
  order: OrderEntity,
  view?: FulfillmentOrderView,
): OrderFulfillmentSummary {
  const resolvedView = view ?? emptyFulfillmentOrderView();
  const hasGroups = resolvedView.groups.length > 0;
  const isCanceled = order.status === OrderStatus.CANCELED;

  return {
    // Without a group the stored projection is the single source of truth: it is
    // what list filtering reads, so detail must never disagree with the list.
    status: hasGroups || isCanceled
      ? computeAggregateStatus({
        orderedQuantity: resolvedView.progress.ordered,
        progress: resolvedView.progress,
        hasGroups,
        isCanceled,
      })
      : order.fulfillmentStatus as FulfillmentAggregateStatus,
    requiresReconciliation: !hasGroups
      && RECONCILABLE_ORDER_STATUSES.has(order.status),
    progress: resolvedView.progress,
    groups: resolvedView.groups,
    legacyShipping: toLegacyOrderShippingEvidence(order),
  };
}
