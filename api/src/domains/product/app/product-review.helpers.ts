import { OrderShippingStatus } from '~/domains/order/domain/enums/order-shipping-status.enum';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';

export function isEligibleForProductReview(order: {
  status: OrderStatus;
  shippingStatus: OrderShippingStatus;
  refundedAt?: Date;
}): boolean {
  if (order.status === OrderStatus.CANCELED || order.status === OrderStatus.REFUNDED || order.refundedAt) {
    return false;
  }

  return order.status === OrderStatus.COMPLETED
    || order.shippingStatus === OrderShippingStatus.DELIVERED;
}

export function trimOptionalReviewText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
