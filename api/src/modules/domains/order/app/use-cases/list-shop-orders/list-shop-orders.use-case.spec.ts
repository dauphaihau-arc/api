import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { ListShopOrdersUseCase } from './list-shop-orders.use-case';

describe('ListShopOrdersUseCase', () => {
  it('does not populate product images for the shop order list read model', async () => {
    const orderRepository = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'order-1',
            orderNumber: 'ORD-1',
            shop: {
              id: 'shop-1',
              shopName: 'Shop 1',
              slug: 'shop-1',
            },
            currency: 'USD',
            customerEmail: 'buyer@example.com',
            paymentType: 'card',
            status: 'paid',
            promoCodes: [],
            shippingStatus: 'pre_transit',
            updatedAt: new Date('2026-06-05T00:00:00.000Z'),
            shippingToCountry: 'US',
            shippingOriginCountries: ['US'],
            shippingEstimatedDelivery: new Date('2026-06-10T00:00:00.000Z'),
            subtotalMinor: 1000,
            shippingMinor: 200,
            discountMinor: 0,
            totalMinor: 1200,
            subtotal: 10,
            totalShippingFee: 2,
            totalDiscount: 0,
            total: 12,
            createdAt: new Date('2026-06-05T00:00:00.000Z'),
            shippingAddress: {
              full_name: 'Buyer One',
              address1: '123 Main St',
              city: 'Los Angeles',
              country: 'US',
              state: 'CA',
              zip: '90001',
            },
          },
        ],
        1,
      ]),
    };
    const orderItemRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          order: { id: 'order-1' },
          title: 'Product 1',
          imageUrl: 'https://example.com/product-1.png',
          quantity: 1,
          unitPriceMinor: 1000,
          originalAmountMinor: null,
          variantName: undefined,
          variantGroupName: undefined,
          variantSubGroupName: undefined,
          percentCouponPercent: null,
          product: {
            id: 'product-1',
            slug: 'product-1',
            shop: { slug: 'shop-1' },
          },
          inventory: {},
        },
      ]),
    };
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === OrderEntity) {
          return orderRepository;
        }

        if (entity === OrderItemEntity) {
          return orderItemRepository;
        }

        throw new Error(`Unexpected repository ${entity.name}`);
      }),
    } as unknown as EntityManager;
    const useCase = new ListShopOrdersUseCase({
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager);

    const result = await useCase.execute('shop-1', {
      page: 1,
      limit: 20,
    });

    expect(orderItemRepository.find).toHaveBeenCalledWith(
      { order: { $in: ['order-1'] } },
      {
        populate: ['product', 'product.shop', 'inventory'],
      }
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.products[0]?.imageStorageKey).toBeUndefined();
  });
});
