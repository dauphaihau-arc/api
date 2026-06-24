import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { AdminRefundNotAllowedError } from '../../errors/order-app.error';
import { UpdateAdminOrderStatusUseCase } from './update-admin-order-status.use-case';

describe('UpdateAdminOrderStatusUseCase', () => {
  function buildUseCase(status = OrderStatus.PAID) {
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-20260604-000001',
      shop: {
        id: 'shop-1',
        shopName: 'Shop 1',
        slug: 'shop-1',
      },
      user: { id: 'user-1' },
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
      status,
      promoCodes: [],
      shippingStatus: 'pre_transit',
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
      refundedAt: undefined,
      supportNote: undefined,
      paymentDetails: {
        checkout_session_id: 'cs_test_1',
      },
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
      unitPriceMinor: 2500,
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
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;
    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const orderEventsService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    return {
      order,
      fakeEntityManager,
      jobDispatcher,
      useCase: new UpdateAdminOrderStatusUseCase(
        entityManager,
        eventEmitter as unknown as EventEmitter2,
        jobDispatcher as never,
        orderEventsService as never,
      ),
    };
  }

  it('marks a paid order as refunded', async () => {
    const {
      useCase, order, fakeEntityManager, jobDispatcher, 
    } = buildUseCase();

    const result = await useCase.execute('order-1', {
      status: OrderStatus.REFUNDED,
    });

    expect(order.status).toBe(OrderStatus.REFUNDED);
    expect(order.refundedAt).toBeInstanceOf(Date);
    expect(fakeEntityManager.flush).toHaveBeenCalled();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'product.refresh-best-seller-rankings',
      { windowDays: 180, limit: 500 },
      expect.objectContaining({
        deduplicationKey: 'product-refresh-best-seller-rankings--180',
        delayMs: 5000,
      }),
    );
    expect(result.status).toBe(OrderStatus.REFUNDED);
  });

  it('rejects refunding an unpaid order', async () => {
    const { useCase } = buildUseCase(OrderStatus.AWAITING_PAYMENT);

    await expect(
      useCase.execute('order-1', {
        status: OrderStatus.REFUNDED,
      }),
    ).rejects.toThrow(AdminRefundNotAllowedError);
  });
});
