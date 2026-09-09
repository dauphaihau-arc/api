import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ShopOrderRefundAction } from '../../../api/rest/dto/update-shop-order-refund.dto';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import {
  SellerRefundActionNotAllowedError,
  SellerRefundNotAllowedError,
} from '../../errors/order-app.error';
import { UpdateShopOrderRefundUseCase } from './update-shop-order-refund.use-case';

describe('UpdateShopOrderRefundUseCase', () => {
  function buildUseCase({
    status = OrderStatus.COMPLETED,
    shippingStatus = OrderShippingStatus.DELIVERED,
    paymentType = PaymentType.CARD,
    refundStatus,
  }: {
    status?: OrderStatus;
    shippingStatus?: OrderShippingStatus;
    paymentType?: PaymentType;
    refundStatus?: 'pending' | 'succeeded' | 'failed' | 'not_required';
  } = {}) {
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-1',
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
      paymentType,
      status,
      currency: 'USD',
      promoCodes: [],
      shippingStatus,
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
      deliveredAt: shippingStatus === OrderShippingStatus.DELIVERED ? new Date('2026-05-28T00:00:00.000Z') : undefined,
      canceledAt: status === OrderStatus.CANCELED ? new Date('2026-05-29T00:00:00.000Z') : undefined,
      cancelReason: status === OrderStatus.CANCELED ? 'Canceled by seller' : undefined,
      refundedAt: undefined,
      supportNote: undefined,
      paymentDetails: {
        payment_intent_id: 'pi_test_1',
        refund_requested_at: undefined,
        refund_failed_reason: undefined,
        ...(refundStatus ? { refund_status: refundStatus } : {}),
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
        images: {
          getItems: () => [],
        },
      },
      inventory: {},
      title: 'Product 1',
      imageUrl: 'https://example.com/product-1.png',
      quantity: 1,
      price: 25,
      salePrice: undefined,
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
          case 'OrderEventEntity':
            return {
              find: jest.fn().mockResolvedValue([]),
            };
          default:
            return {};
        }
      }),
      flush: jest.fn().mockResolvedValue(undefined),
      transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) => callback(fakeEntityManager as EntityManager)),
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;

    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };
    const orderEventsService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    return {
      order,
      fakeEntityManager,
      jobDispatcher,
      useCase: new UpdateShopOrderRefundUseCase(
        entityManager,
        jobDispatcher,
        eventEmitter as unknown as EventEmitter2,
        orderEventsService as never,
      ),
    };
  }

  it('requests a refund for a delivered card order', async () => {
    const { useCase, order, jobDispatcher } = buildUseCase();

    const result = await useCase.execute('shop-1', 'order-1', {
      action: ShopOrderRefundAction.REQUEST,
    });

    expect(order.paymentDetails?.refund_status).toBe('pending');
    expect(order.paymentDetails?.refund_requested_at).toBeDefined();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.process-refund',
      { orderId: 'order-1' },
      { deduplicationKey: 'order-process-refund--order-1' },
    );
    expect(result.paymentDetails?.refund_status).toBe('pending');
  });

  it('retries a failed refund on a canceled order', async () => {
    const { useCase, order } = buildUseCase({
      status: OrderStatus.CANCELED,
      shippingStatus: OrderShippingStatus.PRE_TRANSIT,
      refundStatus: 'failed',
    });

    const result = await useCase.execute('shop-1', 'order-1', {
      action: ShopOrderRefundAction.RETRY,
    });

    expect(order.paymentDetails?.refund_status).toBe('pending');
    expect(order.paymentDetails?.refund_failed_reason).toBeUndefined();
    expect(result.paymentDetails?.refund_status).toBe('pending');
  });

  it('rejects seller refund request before shipment starts', async () => {
    const { useCase } = buildUseCase({
      status: OrderStatus.PAID,
      shippingStatus: OrderShippingStatus.PRE_TRANSIT,
    });

    await expect(
      useCase.execute('shop-1', 'order-1', {
        action: ShopOrderRefundAction.REQUEST,
      }),
    ).rejects.toThrow(SellerRefundNotAllowedError);
  });

  it('rejects retry when the refund has not failed', async () => {
    const { useCase } = buildUseCase({
      refundStatus: 'pending',
    });

    await expect(
      useCase.execute('shop-1', 'order-1', {
        action: ShopOrderRefundAction.RETRY,
      }),
    ).rejects.toThrow(SellerRefundActionNotAllowedError);
  });
});
