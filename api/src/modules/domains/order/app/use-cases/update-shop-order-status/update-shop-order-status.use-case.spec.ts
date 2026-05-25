import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { SellerShippedOrderCancelNotAllowedError } from '../../errors/order-app.error';
import { OrderCancellationService } from '../../order-cancellation.service';
import { UpdateShopOrderStatusUseCase } from './update-shop-order-status.use-case';

describe('UpdateShopOrderStatusUseCase', () => {
  function buildUseCase(input?: {
    orderStatus?: OrderStatus;
    shippingStatus?: OrderShippingStatus;
  }) {
    const order = {
      id: 'order-1',
      shop: {
        id: 'shop-1',
        shopName: 'Shop 1',
        slug: 'shop-1',
      },
      customerEmail: 'buyer@example.com',
      shippingAddress: {
        full_name: 'Buyer One',
        address1: '123 Main St',
        city: 'Los Angeles',
        country: 'US',
        state: 'CA',
        zip: '90001',
      },
      paymentType: 'card',
      status: input?.orderStatus ?? OrderStatus.PAID,
      shippingStatus: input?.shippingStatus ?? OrderShippingStatus.PRE_TRANSIT,
      promoCodes: [],
      shippingOriginCountries: ['US'],
      shippingToCountry: 'US',
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      subtotal: 25,
      totalShippingFee: 5,
      totalDiscount: 0,
      total: 30,
      note: undefined,
      trackingNumber: undefined,
      shippingCarrier: undefined,
      shipmentNote: undefined,
      shippedAt: undefined,
      deliveredAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
    };
    const item = {
      id: 'item-1',
      order: { id: 'order-1' },
      product: {
        id: 'product-1',
        slug: 'product-1',
        shop: { slug: 'shop-1' },
      },
      inventory: {},
      title: 'Product 1',
      imageUrl: 'https://example.com/product-1.png',
      quantity: 1,
      price: 25,
      salePrice: undefined,
      variantName: 'Blue',
      variantGroupName: 'Color',
      variantSubGroupName: undefined,
      percentCouponPercent: null,
    };
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderEntity':
            return {
              findOne: jest.fn().mockResolvedValue(order),
            };
          case 'OrderItemEntity':
            return {
              find: jest.fn().mockResolvedValue([item]),
            };
          default:
            return {};
        }
      }),
      flush: jest.fn().mockResolvedValue(undefined),
      transactional: jest.fn(async (callback) => await callback(fakeEntityManager)),
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;
    const cancellationService = {
      cancelOrder: jest.fn(async (_entityManager, targetOrder, cancelInput) => {
        targetOrder.status = OrderStatus.CANCELED;
        targetOrder.canceledAt = cancelInput.canceledAt;
        targetOrder.cancelReason = cancelInput.cancelReason;
        return { refundRequested: false };
      }),
    } as unknown as OrderCancellationService;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    return {
      order,
      fakeEntityManager,
      cancellationService,
      useCase: new UpdateShopOrderStatusUseCase(
        entityManager,
        cancellationService,
        jobDispatcher as never
      ),
    };
  }

  it('cancels a paid pre-transit order', async () => {
    const { useCase, order, fakeEntityManager, cancellationService } = buildUseCase();

    const result = await useCase.execute('shop-1', 'order-1', {
      status: OrderStatus.CANCELED,
      cancelReason: 'Out of stock',
    });

    expect(order.status).toBe(OrderStatus.CANCELED);
    expect(order.cancelReason).toBe('Out of stock');
    expect(order.canceledAt).toBeInstanceOf(Date);
    expect(cancellationService.cancelOrder).toHaveBeenCalled();
    expect(fakeEntityManager.flush).toHaveBeenCalled();
    expect(result.id).toBe('order-1');
  });

  it('rejects canceling an order that has already shipped', async () => {
    const { useCase } = buildUseCase({
      shippingStatus: OrderShippingStatus.SHIPPED,
    });

    await expect(
      useCase.execute('shop-1', 'order-1', {
        status: OrderStatus.CANCELED,
      })
    ).rejects.toThrow(SellerShippedOrderCancelNotAllowedError);
  });
});
