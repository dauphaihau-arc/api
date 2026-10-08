import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import {
  AdminOrderStatusOverrideNotAllowedError,
  AdminRefundNotAllowedError,
} from '../../errors/order-app.error';
import { UpdateAdminOrderStatusUseCase } from './update-admin-order-status.use-case';

describe('UpdateAdminOrderStatusUseCase', () => {
  function buildUseCase(input: {
    status?: OrderStatus;
    hasGroups?: boolean;
    hasDispatched?: boolean;
  } = {}) {
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-20260604-000001',
      shop: {
        id: 'shop-1',
        publicId: 'shop_1',
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
      status: input.status ?? OrderStatus.PAID,
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
        publicId: 'prod_public1',
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
          case 'FulfillmentGroupEntity':
            return { find: jest.fn().mockResolvedValue([]) };
          default:
            return {};
        }
      }),
      flush: jest.fn().mockResolvedValue(undefined),
      transactional: jest.fn((callback: (em: EntityManager) => unknown) => callback(fakeEntityManager as unknown as EntityManager)),
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
    const orderCancellationService = {
      cancelOrder: jest.fn().mockResolvedValue({ refundRequested: false, inventoryEvents: [] }),
    };
    const fulfillmentService = {
      getDispatchState: jest.fn().mockResolvedValue({
        hasGroups: input.hasGroups ?? false,
        hasDispatched: input.hasDispatched ?? false,
      }),
    };

    return {
      order,
      fakeEntityManager,
      jobDispatcher,
      orderCancellationService,
      fulfillmentService,
      useCase: new UpdateAdminOrderStatusUseCase(
        entityManager,
        eventEmitter as unknown as EventEmitter2,
        jobDispatcher as never,
        orderEventsService as never,
        orderCancellationService as never,
        fulfillmentService as never,
        { load: jest.fn(async () => new Map()) } as never,
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
    const { useCase } = buildUseCase({ status: OrderStatus.AWAITING_PAYMENT });

    await expect(
      useCase.execute('order-1', {
        status: OrderStatus.REFUNDED,
      }),
    ).rejects.toThrow(AdminRefundNotAllowedError);
  });

  it('cancels undispatched quantities through the shared cancellation path', async () => {
    const {
      useCase, orderCancellationService, fulfillmentService,
    } = buildUseCase({ hasGroups: true, hasDispatched: false });

    await useCase.execute('order-1', {
      status: OrderStatus.CANCELED,
      cancelReason: 'Admin cleanup',
    });

    expect(fulfillmentService.getDispatchState).toHaveBeenCalled();
    expect(orderCancellationService.cancelOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        source: 'admin',
        requestRefund: false,
        cancelReason: 'Admin cleanup',
      }),
    );
  });

  it('refuses to cancel once a quantity is dispatched', async () => {
    const { useCase, orderCancellationService } = buildUseCase({
      hasGroups: true,
      hasDispatched: true,
    });

    await expect(
      useCase.execute('order-1', {
        status: OrderStatus.CANCELED,
      }),
    ).rejects.toThrow(AdminOrderStatusOverrideNotAllowedError);

    expect(orderCancellationService.cancelOrder).not.toHaveBeenCalled();
  });
});
