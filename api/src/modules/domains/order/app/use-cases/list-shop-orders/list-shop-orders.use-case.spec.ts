import type { EntityManager } from '@mikro-orm/postgresql';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { ListShopOrdersUseCase } from './list-shop-orders.use-case';

describe('ListShopOrdersUseCase', () => {
  it('applies list filters to the repository query', async () => {
    const orderRepository = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
    };
    const orderItemRepository = {
      find: jest.fn(),
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

    await useCase.execute('shop-1', {
      page: 2,
      limit: 10,
      status: [OrderStatus.PAID, OrderStatus.CANCELED],
      shippingStatus: [OrderShippingStatus.PRE_TRANSIT],
      createdFrom: new Date('2026-06-01T00:00:00.000Z'),
      createdTo: new Date('2026-06-05T23:59:59.999Z'),
      amountMin: 1000,
      amountMax: 5000,
      currency: ['USD', 'HKD'],
      paymentType: [PaymentType.CARD],
      search: 'buyer@example.com',
    });

    expect(orderRepository.findAndCount).toHaveBeenCalledWith(
      {
        shop: 'shop-1',
        status: { $in: [OrderStatus.PAID, OrderStatus.CANCELED] },
        shippingStatus: { $in: [OrderShippingStatus.PRE_TRANSIT] },
        createdAt: {
          $gte: new Date('2026-06-01T00:00:00.000Z'),
          $lte: new Date('2026-06-05T23:59:59.999Z'),
        },
        totalMinor: {
          $gte: 1000,
          $lte: 5000,
        },
        currency: { $in: ['USD', 'HKD'] },
        paymentType: { $in: [PaymentType.CARD] },
        $and: [
          {
            $or: [
              { customerEmail: { $ilike: '%buyer@example.com%' } },
              { orderNumber: { $ilike: '%buyer@example.com%' } },
              { id: 'buyer@example.com' },
            ],
          },
        ],
      },
      {
        populate: ['shop'],
        orderBy: { createdAt: 'desc' },
        offset: 10,
        limit: 10,
      }
    );
    expect(orderRepository.count).toHaveBeenCalledWith({
      shop: 'shop-1',
      shippingStatus: { $in: [OrderShippingStatus.PRE_TRANSIT] },
      createdAt: {
        $gte: new Date('2026-06-01T00:00:00.000Z'),
        $lte: new Date('2026-06-05T23:59:59.999Z'),
      },
      totalMinor: {
        $gte: 1000,
        $lte: 5000,
      },
      currency: { $in: ['USD', 'HKD'] },
      paymentType: { $in: [PaymentType.CARD] },
      $and: [
        {
          $or: [
            { customerEmail: { $ilike: '%buyer@example.com%' } },
            { orderNumber: { $ilike: '%buyer@example.com%' } },
            { id: 'buyer@example.com' },
          ],
        },
      ],
    });
    expect(orderRepository.count).toHaveBeenCalledWith({
      shop: 'shop-1',
      shippingStatus: { $in: [OrderShippingStatus.PRE_TRANSIT] },
      createdAt: {
        $gte: new Date('2026-06-01T00:00:00.000Z'),
        $lte: new Date('2026-06-05T23:59:59.999Z'),
      },
      totalMinor: {
        $gte: 1000,
        $lte: 5000,
      },
      currency: { $in: ['USD', 'HKD'] },
      paymentType: { $in: [PaymentType.CARD] },
      $and: [
        {
          $or: [
            { customerEmail: { $ilike: '%buyer@example.com%' } },
            { orderNumber: { $ilike: '%buyer@example.com%' } },
            { id: 'buyer@example.com' },
          ],
        },
      ],
      status: OrderStatus.PAID,
    });
    expect(orderItemRepository.find).not.toHaveBeenCalled();
  });

  it('falls back to major-unit totals when totalMinor is missing for amount filters', async () => {
    const orderRepository = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
    };
    const orderItemRepository = {
      find: jest.fn(),
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

    await useCase.execute('shop-1', {
      page: 1,
      limit: 20,
      amountMin: 5100,
      currency: ['USD'],
    });

    expect(orderRepository.findAndCount).toHaveBeenCalledWith(
      {
        shop: 'shop-1',
        currency: { $in: ['USD'] },
        $and: [
          {
            $or: [
              { totalMinor: { $gte: 5100 } },
              {
                totalMinor: null,
                total: { $gte: 51 },
              },
            ],
          },
        ],
      },
      {
        populate: ['shop'],
        orderBy: { createdAt: 'desc' },
        offset: 0,
        limit: 20,
      }
    );
  });

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
      count: jest.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0),
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
    expect(result.statusCounts).toEqual({
      all: 1,
      awaiting_payment: 0,
      pending: 0,
      paid: 1,
      refunded: 0,
      completed: 0,
      canceled: 0,
      expired: 0,
      archived: 0,
    });
  });
});
