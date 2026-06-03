import type { EntityManager } from '@mikro-orm/postgresql';
import type { PaymentGateway } from '~/modules/shared/payment/app/ports/payment-gateway';
import type { ModuleRef } from '@nestjs/core';
import { OrderStatus } from '../domain/enums/order-status.enum';
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
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderItemEntity':
            return { find: jest.fn().mockResolvedValue([orderItem]) };
          case 'CouponUsageEntity':
            return { find: jest.fn().mockResolvedValue([couponUsage]) };
          case 'ProductInventoryEntity':
            return { findOne: jest.fn().mockResolvedValue(inventory) };
          default:
            return {};
        }
      }),
      remove,
    } as unknown as EntityManager;

    const refundService = new OrderRefundService(
      {} as EntityManager,
      {} as PaymentGateway,
      {} as ModuleRef
    );
    const service = new OrderCancellationService(refundService);
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
