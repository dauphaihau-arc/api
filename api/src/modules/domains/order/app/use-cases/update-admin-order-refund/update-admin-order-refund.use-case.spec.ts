import type { EntityManager } from '@mikro-orm/postgresql';
import type { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import { AdminOrderRefundAction } from '../../../api/rest/dto/update-admin-order-refund.dto';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { AdminRefundActionNotAllowedError } from '../../errors/order-app.error';
import { UpdateAdminOrderRefundUseCase } from './update-admin-order-refund.use-case';

describe('UpdateAdminOrderRefundUseCase', () => {
  function buildUseCase({
    status = OrderStatus.CANCELED,
    paymentType = PaymentType.CARD,
    refundStatus = 'failed',
  }: {
    status?: OrderStatus;
    paymentType?: PaymentType;
    refundStatus?: 'pending' | 'succeeded' | 'failed' | 'not_required';
  } = {}) {
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
      paymentType,
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
      canceledAt: new Date('2026-05-24T00:00:00.000Z'),
      cancelReason: 'Buyer requested',
      refundedAt: undefined,
      supportNote: undefined,
      paymentDetails: {
        payment_intent_id: 'pi_test_1',
        refund_status: refundStatus,
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
      transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) => callback(fakeEntityManager as EntityManager)),
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;

    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;

    return {
      order,
      fakeEntityManager,
      jobDispatcher,
      useCase: new UpdateAdminOrderRefundUseCase(entityManager, jobDispatcher),
    };
  }

  it('retries a failed refund and re-enqueues the refund job', async () => {
    const { useCase, order, jobDispatcher } = buildUseCase();

    const result = await useCase.execute('order-1', {
      action: AdminOrderRefundAction.RETRY,
    });

    expect(order.paymentDetails?.refund_status).toBe('pending');
    expect(order.paymentDetails?.refund_failed_reason).toBeUndefined();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.process-refund',
      { orderId: 'order-1' },
      { deduplicationKey: 'order-process-refund--order-1' }
    );
    expect(result.paymentDetails?.refund_status).toBe('pending');
  });

  it('marks a canceled order refund as succeeded', async () => {
    const { useCase, order, jobDispatcher } = buildUseCase();

    const result = await useCase.execute('order-1', {
      action: AdminOrderRefundAction.MARK_SUCCEEDED,
    });

    expect(order.status).toBe(OrderStatus.REFUNDED);
    expect(order.refundedAt).toBeInstanceOf(Date);
    expect(order.paymentDetails?.refund_status).toBe('succeeded');
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith('order.send-refund-succeeded-email', { orderId: 'order-1' });
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith('order.send-seller-order-update-email', {
      orderId: 'order-1',
      eventType: 'refunded',
    });
    expect(result.status).toBe(OrderStatus.REFUNDED);
  });

  it('marks a refund as not required', async () => {
    const { useCase, order } = buildUseCase();

    const result = await useCase.execute('order-1', {
      action: AdminOrderRefundAction.MARK_NOT_REQUIRED,
      reason: 'Manual bank transfer never settled',
    });

    expect(order.status).toBe(OrderStatus.CANCELED);
    expect(order.paymentDetails?.refund_status).toBe('not_required');
    expect(order.paymentDetails?.refund_note).toBe('Manual bank transfer never settled');
    expect(result.paymentDetails?.refund_status).toBe('not_required');
  });

  it('marks a refund as failed and notifies the buyer', async () => {
    const { useCase, order, jobDispatcher } = buildUseCase();

    const result = await useCase.execute('order-1', {
      action: AdminOrderRefundAction.MARK_FAILED,
      reason: 'Manual review needed',
    });

    expect(order.paymentDetails?.refund_status).toBe('failed');
    expect(order.paymentDetails?.refund_failed_reason).toBe('Manual review needed');
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith('order.send-refund-failed-email', { orderId: 'order-1' });
    expect(result.paymentDetails?.refund_status).toBe('failed');
  });

  it('rejects retry when the refund is not failed', async () => {
    const { useCase } = buildUseCase({ refundStatus: 'pending' });

    await expect(
      useCase.execute('order-1', {
        action: AdminOrderRefundAction.RETRY,
      })
    ).rejects.toThrow(AdminRefundActionNotAllowedError);
  });
});
