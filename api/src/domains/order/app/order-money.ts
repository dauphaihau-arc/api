import { fromMinorUnits, toMinorUnits } from '~/platform/utils/money';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';

export function getOrderItemAmountMinor(
  item: Pick<
    OrderItemEntity,
    | 'unitPriceMinor'
    | 'lineTotalMinor'
    | 'quantity'
    | 'salePrice'
    | 'price'
    | 'currency'
    | 'id'
  >,
  fallbackCurrency?: string,
): number {
  if (item.unitPriceMinor != null) {
    return item.unitPriceMinor;
  }

  if (item.lineTotalMinor != null && item.quantity > 0) {
    return Math.round(item.lineTotalMinor / item.quantity);
  }

  const currency = item.currency ?? fallbackCurrency;
  if (currency) {
    if (item.salePrice != null) {
      return toMinorUnits(item.salePrice, currency);
    }

    if (item.price != null) {
      return toMinorUnits(item.price, currency);
    }
  }

  throw new Error(`Order item ${item.id} is missing unitPriceMinor`);
}

export function getOrderItemOriginalAmountMinor(
  item: Pick<OrderItemEntity, 'originalAmountMinor'>,
): number | null {
  return item.originalAmountMinor ?? null;
}

export function getOrderSubtotalMinor(
  order: Pick<OrderEntity, 'subtotalMinor' | 'subtotal' | 'currency' | 'id'>,
): number {
  if (order.subtotalMinor != null) {
    return order.subtotalMinor;
  }

  if (order.subtotal != null) {
    return toMinorUnits(order.subtotal, order.currency);
  }

  throw new Error(`Order ${order.id} is missing subtotalMinor`);
}

export function getOrderShippingMinor(
  order: Pick<OrderEntity, 'shippingMinor' | 'totalShippingFee' | 'currency' | 'id'>,
): number {
  if (order.shippingMinor != null) {
    return order.shippingMinor;
  }

  if (order.totalShippingFee != null) {
    return toMinorUnits(order.totalShippingFee, order.currency);
  }

  throw new Error(`Order ${order.id} is missing shippingMinor`);
}

export function getOrderDiscountMinor(
  order: Pick<OrderEntity, 'discountMinor' | 'totalDiscount' | 'currency' | 'id'>,
): number {
  if (order.discountMinor != null) {
    return order.discountMinor;
  }

  if (order.totalDiscount != null) {
    return toMinorUnits(order.totalDiscount, order.currency);
  }

  throw new Error(`Order ${order.id} is missing discountMinor`);
}

export function getOrderTotalMinor(
  order: Pick<OrderEntity, 'totalMinor' | 'total' | 'currency' | 'id'>,
): number {
  if (order.totalMinor != null) {
    return order.totalMinor;
  }

  if (order.total != null) {
    return toMinorUnits(order.total, order.currency);
  }

  throw new Error(`Order ${order.id} is missing totalMinor`);
}

export function getOrderSubtotalMajor(
  order: Pick<OrderEntity, 'subtotalMinor' | 'subtotal' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderSubtotalMinor(order), order.currency);
}

export function getOrderShippingMajor(
  order: Pick<OrderEntity, 'shippingMinor' | 'totalShippingFee' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderShippingMinor(order), order.currency);
}

export function getOrderDiscountMajor(
  order: Pick<OrderEntity, 'discountMinor' | 'totalDiscount' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderDiscountMinor(order), order.currency);
}

export function getOrderTotalMajor(
  order: Pick<OrderEntity, 'totalMinor' | 'total' | 'currency' | 'id'>,
): number {
  return fromMinorUnits(getOrderTotalMinor(order), order.currency);
}
