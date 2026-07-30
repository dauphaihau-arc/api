import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { ProductReviewEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review.entity';
import { ListOrdersUseCase } from './list-orders.use-case';

function buildOrder(input: {
  id: string;
  shopName: string;
  status: OrderStatus;
  shippingStatus: OrderShippingStatus;
}) {
  return {
    id: input.id,
    orderNumber: `ORD-20260527-${input.id.slice(-4).toUpperCase()}`,
    shop: {
      id: `${input.id}-shop`,
      shopName: input.shopName,
      slug: input.shopName.toLowerCase().replaceAll(' ', '-'),
    },
    currency: 'USD',
    paymentType: 'card',
    status: input.status,
    shippingStatus: input.shippingStatus,
    shippingToCountry: 'US',
    shippingOriginCountries: ['US'],
    shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
    promoCodes: [],
    subtotalMinor: 1200,
    shippingMinor: 300,
    discountMinor: 0,
    totalMinor: 1500,
    totalDiscount: 0,
    totalShippingFee: 3,
    total: 15,
    note: undefined,
    customerSupportNote: undefined,
    cancelReason: undefined,
    canceledAt: undefined,
    cancelRequestedAt: undefined,
    refundedAt: undefined,
    paymentDetails: undefined,
    updatedAt: new Date('2026-05-28T00:00:00.000Z'),
    createdAt: new Date('2026-05-27T00:00:00.000Z'),
  } as unknown as OrderEntity;
}

function buildOrderItem(input: {
  id: string;
  order: OrderEntity;
  title: string;
}) {
  return {
    id: input.id,
    order: input.order,
    title: input.title,
    imageUrl: undefined,
    quantity: 1,
    unitPriceMinor: 1200,
    originalAmountMinor: null,
    variantName: undefined,
    variantGroupName: undefined,
    variantSubGroupName: undefined,
    percentCouponPercent: null,
    product: {
      id: `${input.id}-product`,
      slug: input.title.toLowerCase().replaceAll(' ', '-'),
      shop: {
        slug: input.order.shop.slug,
      },
    },
    inventory: {},
  } as unknown as OrderItemEntity;
}

describe('ListOrdersUseCase', () => {
  it('filters my orders by shipping status, order status, and search text', async () => {
    const blueOrder = buildOrder({
      id: 'order-blue-123',
      shopName: 'Blue Mart',
      status: OrderStatus.PAID,
      shippingStatus: OrderShippingStatus.PRE_TRANSIT,
    });
    const redOrder = buildOrder({
      id: 'order-red-456',
      shopName: 'Red Mart',
      status: OrderStatus.CANCELED,
      shippingStatus: OrderShippingStatus.DELIVERED,
    });
    const shippedOrder = buildOrder({
      id: 'order-green-789',
      shopName: 'Green Mart',
      status: OrderStatus.PAID,
      shippingStatus: OrderShippingStatus.SHIPPED,
    });
    const deliveredOrder = buildOrder({
      id: 'order-gold-999',
      shopName: 'Gold Mart',
      status: OrderStatus.COMPLETED,
      shippingStatus: OrderShippingStatus.DELIVERED,
    });
    const refundedOrder = buildOrder({
      id: 'order-silver-555',
      shopName: 'Silver Mart',
      status: OrderStatus.REFUNDED,
      shippingStatus: OrderShippingStatus.DELIVERED,
    });
    const paymentOrder = buildOrder({
      id: 'order-pay-111',
      shopName: 'Pay Mart',
      status: OrderStatus.AWAITING_PAYMENT,
      shippingStatus: OrderShippingStatus.PRE_TRANSIT,
    });
    const orders = [blueOrder, redOrder, shippedOrder, deliveredOrder, refundedOrder, paymentOrder];
    const orderItems = [
      buildOrderItem({
        id: 'item-1',
        order: blueOrder,
        title: 'Ocean Hoodie',
      }),
      buildOrderItem({
        id: 'item-2',
        order: redOrder,
        title: 'Crimson Sneaker',
      }),
      buildOrderItem({
        id: 'item-3',
        order: shippedOrder,
        title: 'Forest Jacket',
      }),
      buildOrderItem({
        id: 'item-4',
        order: deliveredOrder,
        title: 'Golden Watch',
      }),
      buildOrderItem({
        id: 'item-5',
        order: refundedOrder,
        title: 'Silver Ring',
      }),
      buildOrderItem({
        id: 'item-6',
        order: paymentOrder,
        title: 'Pending Bag',
      }),
    ];
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === OrderEntity) {
          return {
            find: jest.fn().mockResolvedValue(orders),
          };
        }

        if (entity === OrderItemEntity) {
          return {
            find: jest.fn().mockResolvedValue(orderItems),
          };
        }

        if (entity === ProductReviewEntity) {
          return {
            find: jest.fn().mockResolvedValue([]),
          };
        }

        throw new Error(`Unexpected repository ${entity.name}`);
      }),
    } as unknown as EntityManager;
    const useCase = new ListOrdersUseCase({
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager, {
      getPublicUrl: jest.fn(),
    } as never);

    const notShipped = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        shippingStatus: OrderShippingStatus.PRE_TRANSIT,
      },
    );
    const canceled = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        status: OrderStatus.CANCELED,
      },
    );
    const searchedByProduct = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        search: 'hoodie',
      },
    );
    const searchedByShop = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        search: 'red mart',
      },
    );
    const awaitingPayment = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        state: 'awaiting_payment',
      },
    );
    const processing = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        state: 'processing',
      },
    );
    const shipped = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        state: 'shipped',
      },
    );
    const delivered = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        state: 'delivered',
      },
    );
    const refunded = await useCase.execute(
      { userId: 'user-1' } as never,
      {
        page: 1,
        limit: 20,
        state: 'refunded',
      },
    );

    expect(notShipped.orderShops.map((order) => order.id)).toEqual([
      'order-blue-123',
      'order-pay-111',
    ]);
    expect(canceled.orderShops.map((order) => order.id)).toEqual(['order-red-456']);
    expect(searchedByProduct.orderShops.map((order) => order.id)).toEqual(['order-blue-123']);
    expect(searchedByShop.orderShops.map((order) => order.id)).toEqual(['order-red-456']);
    expect(awaitingPayment.orderShops.map((order) => order.id)).toEqual(['order-pay-111']);
    expect(processing.orderShops.map((order) => order.id)).toEqual(['order-blue-123']);
    expect(shipped.orderShops.map((order) => order.id)).toEqual(['order-green-789']);
    expect(delivered.orderShops.map((order) => order.id)).toEqual([
      'order-red-456',
      'order-gold-999',
      'order-silver-555',
    ]);
    expect(refunded.orderShops.map((order) => order.id)).toEqual(['order-silver-555']);
  });
});
