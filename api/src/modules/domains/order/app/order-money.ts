import { fromMinorUnits } from '~/common/utils/money';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }

  return value;
}

export function getOrderItemAmountMinor(
  item: Pick<OrderItemEntity, 'unitPriceMinor' | 'id'>,
): number {
  return requireValue(
    item.unitPriceMinor,
    `Order item ${item.id} is missing unitPriceMinor`
  );
}

export function getOrderItemOriginalAmountMinor(
  item: Pick<OrderItemEntity, 'originalAmountMinor'>,
): number | null {
  return item.originalAmountMinor ?? null;
}

export function getOrderSubtotalMinor(
  order: Pick<OrderEntity, 'subtotalMinor' | 'id'>,
): number {
  return requireValue(
    order.subtotalMinor,
    `Order ${order.id} is missing subtotalMinor`
  );
}

export function getOrderShippingMinor(
  order: Pick<OrderEntity, 'shippingMinor' | 'id'>,
): number {
  return requireValue(
    order.shippingMinor,
    `Order ${order.id} is missing shippingMinor`
  );
}

export function getOrderDiscountMinor(
  order: Pick<OrderEntity, 'discountMinor' | 'id'>,
): number {
  return requireValue(
    order.discountMinor,
    `Order ${order.id} is missing discountMinor`
  );
}

export function getOrderTotalMinor(
  order: Pick<OrderEntity, 'totalMinor' | 'id'>,
): number {
  return requireValue(
    order.totalMinor,
    `Order ${order.id} is missing totalMinor`
  );
}

export function getOrderSubtotalMajor(
  order: Pick<OrderEntity, 'subtotalMinor' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderSubtotalMinor(order), order.currency);
}

export function getOrderShippingMajor(
  order: Pick<OrderEntity, 'shippingMinor' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderShippingMinor(order), order.currency);
}

export function getOrderDiscountMajor(
  order: Pick<OrderEntity, 'discountMinor' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderDiscountMinor(order), order.currency);
}

export function getOrderTotalMajor(
  order: Pick<OrderEntity, 'totalMinor' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderTotalMinor(order), order.currency);
}
