import type { EntityManager } from '@mikro-orm/postgresql';
import type { PaymentGateway } from '../../../../integrations/payment/app/ports/payment-gateway';
import type { ModuleRef } from '@nestjs/core';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import type { CheckoutStockReservationService } from '../../../checkout/app/services/checkout-stock-reservation.service';
import { OrderCancellationService } from './order-cancellation.service';
import { OrderRefundService } from './order-refund.service';

describe('OrderCancellationService', () => {
  it('restores stock and coupon usage for paid orders', async () => {
    const inventory = { id: 'inventory-1', stock: 2 };
    const orderItem = {
      product: { id: 'product-1' },
      inventory: { id: 'inventory-1' },
      quantity: 3,
    };
    const couponUsage = {
      coupon: { usesCount: 4 },
    };
    const order = {
      id: 'order-1',
      paymentType: 'card',
      status: OrderStatus.PAID,
      cancelReason: undefined,
      paymentDetails: { type: 'card' },
    };
    const remove = jest.fn();
    const checkoutStockReservationService = {
      restoreInventoryForOrderItems: jest.fn().mockImplementation(async (_entityManager, items) => {
        inventory.stock += items[0]?.quantity ?? 0;
        return [
          {
            productId: 'product-1',
            inventoryId: 'inventory-1',
            stock: inventory.stock,
          },
        ];
      }),
    } as unknown as jest.Mocked<CheckoutStockReservationService>;
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderItemEntity':
            return { find: jest.fn().mockResolvedValue([orderItem]) };
          case 'CouponUsageEntity':
            return { find: jest.fn().mockResolvedValue([couponUsage]) };
          default:
            return {};
        }
      }),
      remove,
    } as unknown as EntityManager;

    const refundService = new OrderRefundService(
      {} as EntityManager,
      {} as PaymentGateway,
      {} as ModuleRef,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const service = new OrderCancellationService(
      refundService,
      checkoutStockReservationService,
    );
    const canceledAt = new Date('2026-05-24T00:00:00.000Z');

    const result = await service.cancelOrder(fakeEntityManager, order as never, {
      canceledAt,
      cancelReason: 'Changed my mind',
      source: 'buyer',
    });

    expect(result).toEqual({
      refundRequested: true,
      inventoryEvents: [
        expect.objectContaining({
          productId: 'product-1',
          inventoryId: 'inventory-1',
          stock: 5,
        }),
      ],
    });
    expect(order.status).toBe(OrderStatus.CANCELED);
    expect(order.cancelReason).toBe('Changed my mind');
    expect(inventory.stock).toBe(5);
    expect(checkoutStockReservationService.restoreInventoryForOrderItems).toHaveBeenCalledWith(
      fakeEntityManager,
      [{
        inventoryId: 'inventory-1',
        productId: 'product-1',
        quantity: 3,
      }],
    );
    expect(couponUsage.coupon.usesCount).toBe(3);
    expect(remove).toHaveBeenCalledWith(couponUsage);
    expect(order.paymentDetails).toEqual({
      type: 'card',
      cancellation: {
        canceled_at: canceledAt.toISOString(),
        reason: 'Changed my mind',
        source: 'buyer',
        allocations_reverted: true,
      },
      refund_status: 'pending',
      refund_requested_at: canceledAt.toISOString(),
      refund_failed_reason: undefined,
    });
  });
});
