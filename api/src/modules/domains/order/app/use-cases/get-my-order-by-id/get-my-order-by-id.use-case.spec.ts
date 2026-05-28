import type { EntityManager } from '@mikro-orm/postgresql';
import { GetMyOrderByIdUseCase } from './get-my-order-by-id.use-case';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { UserStatus } from '../../../../auth/domain/enums/user-status.enum';

describe('GetMyOrderByIdUseCase', () => {
  it('returns a buyer-owned order with shipping details', async () => {
    const order = {
      id: 'order-1',
      shop: {
        id: 'shop-1',
        shopName: 'Shop 1',
        slug: 'shop-1',
      },
      customerEmail: 'buyer@example.com',
      paymentType: 'card',
      status: OrderStatus.PAID,
      promoCodes: ['WELCOME'],
      shippingStatus: OrderShippingStatus.SHIPPED,
      shippingOriginCountries: ['US'],
      shippingToCountry: 'US',
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      trackingNumber: '1Z999',
      shippingCarrier: 'UPS',
      shipmentNote: 'Dropped at carrier',
      shippedAt: new Date('2026-05-24T00:00:00.000Z'),
      deliveredAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      subtotalMinor: 10000,
      shippingMinor: 1000,
      discountMinor: 500,
      totalMinor: 10500,
      subtotal: 100,
      totalShippingFee: 10,
      totalDiscount: 5,
      total: 105,
      note: 'Leave at door',
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
      shippingAddress: {
        full_name: 'Buyer One',
        address1: '123 Main St',
        address2: 'Apt 5',
        city: 'Los Angeles',
        country: 'US',
        state: 'CA',
        zip: '90001',
        phone: '123456789',
      },
    };
    const items = [
      {
        id: 'item-1',
        product: {
          id: 'product-1',
          slug: 'product-1',
          shop: { slug: 'shop-1' },
        },
        title: 'Product 1',
        imageUrl: 'https://example.com/product-1.png',
        quantity: 2,
        unitPriceMinor: 4750,
        originalAmountMinor: 5000,
        lineTotalMinor: 9500,
        currency: 'USD',
        price: 50,
        salePrice: 47.5,
        variantName: 'Blue',
        variantGroupName: 'Color',
        variantSubGroupName: undefined,
        percentCouponPercent: 5,
      },
    ];

    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderEntity':
            return {
              findOne: jest.fn().mockResolvedValue(order),
            };
          case 'OrderItemEntity':
            return {
              find: jest.fn().mockResolvedValue(items),
            };
          default:
            return {};
        }
      }),
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;

    const useCase = new GetMyOrderByIdUseCase(entityManager);

    const result = await useCase.execute(
      {
        userId: 'user-1',
        email: 'buyer@example.com',
        status: UserStatus.ACTIVE,
        sessionId: 'session-1',
        roles: [],
        permissions: [],
      },
      'order-1'
    );

    expect(result.id).toBe('order-1');
    expect(result.status).toBe(OrderStatus.PAID);
    expect(result.shippingStatus).toBe(OrderShippingStatus.SHIPPED);
    expect(result.trackingNumber).toBe('1Z999');
    expect(result.shippingAddress.fullName).toBe('Buyer One');
    expect(result.products).toHaveLength(1);
  });
});
