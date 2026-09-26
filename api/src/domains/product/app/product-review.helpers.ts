import { FulfillmentAggregateStatus } from '~/domains/fulfillment/domain/enums/fulfillment-aggregate-status.enum';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';

/**
 * Whole-order review eligibility. Delivery of a single consignment must not
 * unlock review while required quantities remain outstanding, so eligibility
 * reads the aggregate fulfillment status rather than one Shipment's journey.
 */
export function isEligibleForProductReview(order: {
  status: OrderStatus;
  fulfillmentStatus: FulfillmentAggregateStatus;
  refundedAt?: Date;
}): boolean {
  if (order.status === OrderStatus.CANCELED || order.status === OrderStatus.REFUNDED || order.refundedAt) {
    return false;
  }

  return order.status === OrderStatus.COMPLETED
    || order.fulfillmentStatus === FulfillmentAggregateStatus.DELIVERED;
}

export function trimOptionalReviewText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
