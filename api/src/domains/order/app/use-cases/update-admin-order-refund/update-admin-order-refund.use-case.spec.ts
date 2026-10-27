import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
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
    moneyEventBooking = 'outbox',
  }: {
    status?: OrderStatus;
    paymentType?: PaymentType;
    refundStatus?: 'pending' | 'succeeded' | 'failed' | 'not_required';
    moneyEventBooking?: 'outbox' | 'inline';
  } = {}) {
    const order = {
      id: 'order-1',
      publicId: 'ord_test1',
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
      paymentType,
      status,
      currency: 'USD',
      promoCodes: [],
      shippingStatus: 'pre_transit',
      shippingOriginCountries: ['US'],
      shippingToCountry: 'US',
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      subtotal: 25,
      subtotalMinor: 2500,
      shippingMinor: 500,
      discountMinor: 0,
      totalShippingFee: 5,
      totalDiscount: 0,
      total: 30,
      totalMinor: 3000,
      note: undefined,
      trackingNumber: undefined,
      shippingCarrier: undefined,
      shipmentNote: undefined,
      shippedAt: undefined,
      deliveredAt: undefined,
      canceledAt: new Date('2026-05-24T00:00:00.000Z'),
      cancelReason: 'Buyer requested',
      refundedAt: undefined,
      paymentDetails: {
        payment_intent_id: 'pi_test_1',
        refund_status: refundStatus,
        refund_failed_reason: undefined,
        refund_note: undefined,
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

    // The repository's succeeded total is what was actually marked succeeded:
    // the use case re-reads it after marking, so the projection reflects the
    // recorded facts rather than an assumption.
    let succeededTotalMinor = 0;
    const markSucceeded = jest.fn().mockImplementation(async (_id, input) => {
      succeededTotalMinor += input.refundedAmountMinor;
      return true;
    });
    const outboxEvent = {
      status: OutboxEventStatus.PENDING,
      processedAt: undefined as Date | undefined,
    };
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(outboxEvent),
    };
    const recordWithin = jest.fn().mockResolvedValue({ recorded: true });
    const sumAmountMinorByStatus = jest.fn(
      (_orderId: string, statuses: readonly string[]) => Promise.resolve(
        statuses.includes('succeeded') ? succeededTotalMinor : 0,
      ),
    );
    const auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    return {
      order,
      fakeEntityManager,
      jobDispatcher,
      outboxService,
      outboxEvent,
      recordWithin,
      auditLogService,
      useCase: new UpdateAdminOrderRefundUseCase(
        entityManager,
        jobDispatcher,
        eventEmitter as unknown as EventEmitter2,
        orderEventsService as never,
        {
          findPendingByOrderId: jest.fn().mockResolvedValue(null),
          createPending: jest.fn().mockResolvedValue({ id: 'refund-1', amountMinor: 3000 }),
          sumAmountMinorByStatus,
          markSucceeded,
          markFailed: jest.fn().mockResolvedValue(true),
        } as never,
        outboxService as never,
        { load: jest.fn(async () => new Map()) } as never,
        auditLogService as never,
        { recordWithin } as never,
        { moneyEventBooking } as never,
      ),
    };
  }

  it('retries a failed refund and re-enqueues the refund job', async () => {
    const {
      useCase, order, jobDispatcher, auditLogService,
    } = buildUseCase();

    const result = await useCase.execute('order-1', {
      action: AdminOrderRefundAction.RETRY,
    });

    expect(order.paymentDetails?.refund_status).toBe('pending');
    expect(order.paymentDetails?.refund_failed_reason).toBeUndefined();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.process-refund',
      { orderId: 'order-1' },
      { deduplicationKey: 'order-process-refund--order-1' },
    );
    expect(result.paymentDetails?.refund_status).toBe('pending');
    expect(auditLogService.record).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledWith({
      action: 'order.refund.updated',
      entityType: 'order',
      entityId: 'order-1',
      entityPublicId: 'ord_test1',
      summary: {
        action: AdminOrderRefundAction.RETRY,
        refundStatus: 'pending',
      },
    });
  });

  it('marks a canceled order refund as succeeded', async () => {
    const {
      useCase, order, jobDispatcher, outboxService,
    } = buildUseCase();

    const result = await useCase.execute('order-1', {
      action: AdminOrderRefundAction.MARK_SUCCEEDED,
    });

    expect(outboxService.createOrderRefundedEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-1',
        refundedAmountMinor: 3000,
      }),
    );
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

  it('leaves refund booking to the worker when money events are booked from the outbox', async () => {
    const {
      useCase, recordWithin, outboxEvent,
    } = buildUseCase();

    await useCase.execute('order-1', {
      action: AdminOrderRefundAction.MARK_SUCCEEDED,
    });

    expect(recordWithin).not.toHaveBeenCalled();
    expect(outboxEvent.status).toBe(OutboxEventStatus.PENDING);
    expect(outboxEvent.processedAt).toBeUndefined();
  });

  it('books the refund journal entry inline and marks the outbox row processed', async () => {
    const {
      useCase, recordWithin, outboxService, outboxEvent,
    } = buildUseCase({ moneyEventBooking: 'inline' });

    await useCase.execute('order-1', {
      action: AdminOrderRefundAction.MARK_SUCCEEDED,
    });

    const outboxEntityManager = jest.mocked(outboxService.createOrderRefundedEvent)
      .mock.calls[0]?.[0];

    expect(recordWithin).toHaveBeenCalledTimes(1);
    expect(recordWithin).toHaveBeenCalledWith(
      outboxEntityManager,
      expect.objectContaining({
        refundId: 'refund-1',
        orderId: 'order-1',
        orderPublicId: 'ord_test1',
        shopId: 'shop-1',
        currency: 'USD',
        refundedAmountMinor: 3000,
        occurredAt: expect.any(String),
      }),
    );
    expect(outboxEvent.status).toBe(OutboxEventStatus.PROCESSED);
    expect(outboxEvent.processedAt).toBeInstanceOf(Date);
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
    const { useCase, auditLogService } = buildUseCase({ refundStatus: 'pending' });

    await expect(
      useCase.execute('order-1', {
        action: AdminOrderRefundAction.RETRY,
      }),
    ).rejects.toThrow(AdminRefundActionNotAllowedError);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
