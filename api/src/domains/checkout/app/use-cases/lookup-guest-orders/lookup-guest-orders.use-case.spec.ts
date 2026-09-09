import type { EntityManager } from '@mikro-orm/postgresql';
import { LookupGuestOrdersUseCase } from './lookup-guest-orders.use-case';

describe('LookupGuestOrdersUseCase', () => {
  function buildUseCase() {
    const find = jest.fn();
    const itemFind = jest.fn();
    const execute = jest.fn();

    const entityManager = {
      fork: jest.fn(() => ({
        getRepository: jest.fn((entity: { name?: string }) => {
          switch (entity?.name) {
            case 'OrderEntity':
              return { find };
            case 'OrderItemEntity':
              return { find: itemFind };
            default:
              return { find: jest.fn() };
          }
        }),
        getConnection: jest.fn(() => ({ execute })),
      })),
    } as unknown as EntityManager;

    return {
      useCase: new LookupGuestOrdersUseCase(entityManager),
      find,
      itemFind,
      execute,
    };
  }

  it('looks up guest orders by email and order ids', async () => {
    const { useCase, find, itemFind } = buildUseCase();
    const orders = [{
      id: 'order-1',
      orderNumber: 'ORD-1',
      shop: { id: 'shop-1', shopName: 'Shop 1', slug: 'shop-1' },
      paymentType: 'cash',
      promoCodes: [],
      shippingStatus: 'pre_transit',
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      shippingToCountry: 'US',
      shippingOriginCountries: ['US'],
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      currency: 'USD',
      subtotalMinor: 1000,
      shippingMinor: 0,
      discountMinor: 0,
      totalMinor: 1000,
      subtotal: 10,
      totalShippingFee: 0,
      totalDiscount: 0,
      total: 10,
      note: undefined,
      shippingAddress: { zip: '78701' },
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
    }];
    const orderItems = [{
      id: 'item-1',
      order: { id: 'order-1' },
      product: { id: 'product-1', slug: 'product-1', shop: { slug: 'shop-1' } },
      title: 'Product 1',
      imageUrl: 'https://example.com/p1.png',
      quantity: 1,
      unitPriceMinor: 1000,
      originalAmountMinor: null,
      lineTotalMinor: 1000,
      currency: 'USD',
      price: 10,
      salePrice: null,
      percentCouponPercent: null,
      inventory: {},
    }];

    find.mockResolvedValue(orders);
    itemFind.mockResolvedValue(orderItems);

    const result = await useCase.execute({
      email: 'Guest@Example.com',
      orderIds: ['order-1'],
      zip: '78701',
    });

    expect(find).toHaveBeenCalledWith(
      { id: { $in: ['order-1'] }, customerEmail: 'guest@example.com' },
      expect.any(Object),
    );
    expect(result.orderShops).toHaveLength(1);
    expect(result.orderShops[0]?.products[0]?.title).toBe('Product 1');
  });

  it('filters out manual lookups when the zip does not match', async () => {
    const { useCase, find, itemFind } = buildUseCase();
    find.mockResolvedValue([{
      id: 'order-1',
      orderNumber: 'ORD-1',
      shop: { id: 'shop-1', shopName: 'Shop 1', slug: 'shop-1' },
      paymentType: 'cash',
      promoCodes: [],
      shippingStatus: 'pre_transit',
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      shippingToCountry: 'US',
      shippingOriginCountries: ['US'],
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      currency: 'USD',
      subtotalMinor: 1000,
      shippingMinor: 0,
      discountMinor: 0,
      totalMinor: 1000,
      subtotal: 10,
      totalShippingFee: 0,
      totalDiscount: 0,
      total: 10,
      note: undefined,
      shippingAddress: { zip: '78701' },
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
    }]);
    itemFind.mockResolvedValue([]);

    const result = await useCase.execute({
      email: 'guest@example.com',
      orderIds: ['order-1'],
      zip: '99999',
    });

    expect(result.orderShops).toHaveLength(0);
  });

  it('looks up guest orders by checkout session id without requiring email', async () => {
    const {
      useCase, find, itemFind, execute, 
    } = buildUseCase();
    execute.mockResolvedValue([{ id: 'order-1' }]);
    find.mockResolvedValue([{
      id: 'order-1',
      orderNumber: 'ORD-1',
      shop: { id: 'shop-1', shopName: 'Shop 1', slug: 'shop-1' },
      paymentType: 'card',
      promoCodes: [],
      shippingStatus: 'pre_transit',
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      shippingToCountry: 'US',
      shippingOriginCountries: ['US'],
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      currency: 'USD',
      subtotalMinor: 1000,
      shippingMinor: 0,
      discountMinor: 0,
      totalMinor: 1000,
      subtotal: 10,
      totalShippingFee: 0,
      totalDiscount: 0,
      total: 10,
      note: undefined,
      shippingAddress: { zip: '78701' },
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
    }]);
    itemFind.mockResolvedValue([]);

    const result = await useCase.execute({
      sessionId: 'cs_test_123',
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('where payment_details ->> \'checkout_session_id\' = ?'),
      ['cs_test_123'],
    );
    expect(find).toHaveBeenCalledWith(
      { id: { $in: ['order-1'] } },
      expect.any(Object),
    );
    expect(result.orderShops).toHaveLength(1);
  });
});
