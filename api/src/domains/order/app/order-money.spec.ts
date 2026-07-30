import {
  getOrderDiscountMinor,
  getOrderItemAmountMinor,
  getOrderShippingMinor,
  getOrderSubtotalMinor,
  getOrderTotalMinor,
} from './order-money';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';

describe('getOrderItemAmountMinor', () => {
  it('returns unitPriceMinor when present', () => {
    expect(getOrderItemAmountMinor({
      id: 'item-1',
      unitPriceMinor: 1250,
      lineTotalMinor: 2500,
      quantity: 2,
      salePrice: 12.5,
      price: 15,
      currency: 'USD',
    })).toBe(1250);
  });

  it('falls back to lineTotalMinor per unit when unitPriceMinor is missing', () => {
    expect(getOrderItemAmountMinor({
      id: 'item-2',
      unitPriceMinor: undefined,
      lineTotalMinor: 2500,
      quantity: 2,
      salePrice: undefined,
      price: 15,
      currency: 'USD',
    })).toBe(1250);
  });

  it('falls back to salePrice using order currency when stored minors are missing', () => {
    expect(getOrderItemAmountMinor({
      id: 'item-3',
      unitPriceMinor: undefined,
      lineTotalMinor: undefined,
      quantity: 1,
      salePrice: 12.5,
      price: 15,
      currency: undefined,
    }, 'USD')).toBe(1250);
  });

  it('throws when no recoverable pricing data exists', () => {
    expect(() => getOrderItemAmountMinor({
      id: 'item-4',
      unitPriceMinor: undefined,
      lineTotalMinor: undefined,
      quantity: 1,
      salePrice: undefined,
      currency: undefined,
    } as Pick<
      OrderItemEntity,
      | 'unitPriceMinor'
      | 'lineTotalMinor'
      | 'quantity'
      | 'salePrice'
      | 'price'
      | 'currency'
      | 'id'
    >)).toThrow('Order item item-4 is missing unitPriceMinor');
  });
});

describe('order minor fallbacks', () => {
  const legacyOrder: Pick<
    OrderEntity,
    | 'id'
    | 'currency'
    | 'subtotalMinor'
    | 'subtotal'
    | 'shippingMinor'
    | 'totalShippingFee'
    | 'discountMinor'
    | 'totalDiscount'
    | 'totalMinor'
    | 'total'
  > = {
    id: 'order-1',
    currency: 'USD',
    subtotalMinor: undefined,
    subtotal: 12,
    shippingMinor: undefined,
    totalShippingFee: 3,
    discountMinor: undefined,
    totalDiscount: 1.5,
    totalMinor: undefined,
    total: 13.5,
  };

  it('falls back subtotalMinor from subtotal', () => {
    expect(getOrderSubtotalMinor(legacyOrder)).toBe(1200);
  });

  it('falls back shippingMinor from totalShippingFee', () => {
    expect(getOrderShippingMinor(legacyOrder)).toBe(300);
  });

  it('falls back discountMinor from totalDiscount', () => {
    expect(getOrderDiscountMinor(legacyOrder)).toBe(150);
  });

  it('falls back totalMinor from total', () => {
    expect(getOrderTotalMinor(legacyOrder)).toBe(1350);
  });
});
