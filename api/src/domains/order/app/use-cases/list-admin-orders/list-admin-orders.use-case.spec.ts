import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { ListAdminOrdersUseCase } from './list-admin-orders.use-case';

describe('ListAdminOrdersUseCase', () => {
  it('returns paginated admin order summaries', async () => {
    const orders = [
      {
        id: 'order-1',
        orderNumber: 'ORD-1',
        shop: {
          id: 'shop-1',
          shopName: 'Shop 1',
          slug: 'shop-1',
        },
        customerEmail: 'buyer@example.com',
        paymentType: 'card',
        status: OrderStatus.PAID,
        shippingStatus: OrderShippingStatus.PRE_TRANSIT,
        total: 42,
        supportNote: 'Investigating',
        cancelReason: undefined,
        refundedAt: undefined,
        createdAt: new Date('2026-05-23T00:00:00.000Z'),
      },
    ];

    const fakeEntityManager = {
      getRepository: jest.fn(() => ({
        findAndCount: jest.fn().mockResolvedValue([orders, 1]),
      })),
    } as unknown as EntityManager;

    const useCase = new ListAdminOrdersUseCase({
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager);

    const result = await useCase.execute({
      page: 1,
      limit: 20,
      search: 'buyer@example.com',
    });

    expect(result.totalResults).toBe(1);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        id: 'order-1',
        customerEmail: 'buyer@example.com',
        status: OrderStatus.PAID,
        shippingStatus: OrderShippingStatus.PRE_TRANSIT,
      }),
    );
  });
});
