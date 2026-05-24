import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderCancellationService } from './order-cancellation.service';

describe('OrderCancellationService', () => {
  it('restores stock and coupon usage for paid orders', async () => {
    const inventory = { id: 'inventory-1', stock: 2 };
    const orderItem = {
      inventory: { id: 'inventory-1' },
      quantity: 3,
    };
    const couponUsage = {
      coupon: { usesCount: 4 },
    };
    const order = {
      id: 'order-1',
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

    const service = new OrderCancellationService();
    const canceledAt = new Date('2026-05-24T00:00:00.000Z');

    await service.cancelOrder(fakeEntityManager, order as never, {
      canceledAt,
      cancelReason: 'Changed my mind',
      source: 'buyer',
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
    });
  });
});
