import type { EntityManager } from '@mikro-orm/postgresql';
import type { ModuleRef } from '@nestjs/core';
import type { PaymentGateway } from '../../../../integrations/payment/app/ports/payment-gateway';
import type { NotifyUserUseCase } from '../../../../domains/notification/app/use-cases/notify-user/notify-user.use-case';
import type { JobDispatcher } from '../../../../integrations/queue/app/ports/job-dispatcher';
import { PaymentType } from '../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import type { OrderRefundQueryRepository } from '../ports/order-refund-query.repository';
import type { OrderRefundRepository } from '../ports/order-refund.repository';
import type { OrderRefundOutboxService } from './order-refund-outbox.service';
import { OrderRefundService } from './order-refund.service';

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    publicId: 'ord_1',
    orderNumber: 'ORD-20260604-000001',
    paymentType: PaymentType.CARD,
    currency: 'USD',
    totalMinor: 3000,
    status: OrderStatus.CANCELED,
    refundedAt: undefined,
    shop: {
      id: 'shop-1',
      publicId: 'shop_1',
      ownerUser: {
        id: 'seller-1',
      },
    },
    paymentDetails: {
      payment_intent_id: 'pi_123',
      refund_status: 'pending',
    },
    ...overrides,
  };
}
function buildService<TOrder extends object>(input: {
  order: TOrder;
  paymentGateway: PaymentGateway;
  refundRepository: OrderRefundRepository;
  outboxService: OrderRefundOutboxService;
  jobDispatcher: JobDispatcher;
  notifyUserUseCase: NotifyUserUseCase;
  orderRefundQueryRepository?: OrderRefundQueryRepository;
}): OrderRefundService {
  const transactionalEntityManager = {
    getRepository: jest.fn(() => ({
      findOne: jest.fn().mockResolvedValue(input.order),
    })),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const entityManager = {
    fork: jest.fn(() => ({
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(input.order),
      })),
    })),
    transactional: jest.fn(async (callback) => await callback(transactionalEntityManager)),
  } as unknown as EntityManager;
  const moduleRef = {
    get: jest.fn((token: unknown) => {
      if (typeof token === 'function' && token.name === 'NotifyUserUseCase') {
        return input.notifyUserUseCase;
      }
      return input.jobDispatcher;
    }),
  } as unknown as ModuleRef;

  return new OrderRefundService(
    entityManager,
    input.paymentGateway,
    moduleRef,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    input.orderRefundQueryRepository ?? {
      findById: jest.fn().mockResolvedValue(input.order),
      findByIdForUpdate: jest.fn().mockResolvedValue(input.order),
      findByPublicId: jest.fn(),
      findByIdWithShopOwner: jest.fn().mockResolvedValue(input.order),
    } as unknown as OrderRefundQueryRepository,
    input.refundRepository,
    input.outboxService,
  );
}

function buildRefundRepository(overrides: Partial<OrderRefundRepository> = {}): OrderRefundRepository {
  return {
    createPending: jest.fn(),
    findPendingByOrderId: jest.fn().mockResolvedValue({
      id: 'refund-1',
      amountMinor: 3000,
      order: { id: 'order-1' },
    }),
    findLatestByOrderId: jest.fn(),
    findByProviderRefundId: jest.fn().mockResolvedValue(null),
    findPendingByPaymentIntentId: jest.fn().mockResolvedValue({
      id: 'refund-1',
      amountMinor: 3000,
      order: { id: 'order-1' },
    }),
    findOrderByPaymentIntentId: jest.fn().mockResolvedValue(null),
    attachProviderRefund: jest.fn().mockResolvedValue(true),
    findPendingBefore: jest.fn().mockResolvedValue([]),
    sumAmountMinorByStatus: jest.fn().mockResolvedValue(3000),
    markSucceeded: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as OrderRefundRepository;
}

// eslint-disable-next-line max-lines-per-function
describe('OrderRefundService', () => {
  it('marks paid card cancellations as refund pending', () => {
    const service = buildService({
      order: buildOrder(),
      paymentGateway: {} as PaymentGateway,
      refundRepository: buildRefundRepository(),
      outboxService: {} as OrderRefundOutboxService,
      jobDispatcher: {} as JobDispatcher,
      notifyUserUseCase: {} as NotifyUserUseCase,
    });
    const order = {
      paymentType: PaymentType.CARD,
      paymentDetails: { payment_intent_id: 'pi_123' },
    };
    const now = new Date('2026-05-25T00:00:00.000Z');

    const shouldRefund = service.prepareRefundOnCancellation(
      order as never,
      OrderStatus.PAID,
      now,
    );

    expect(shouldRefund).toBe(true);
    expect(order.paymentDetails).toEqual({
      payment_intent_id: 'pi_123',
      refund_status: 'pending',
      refund_requested_at: now.toISOString(),
      refund_failed_reason: undefined,
    });
  });

  it('requests the refund and leaves the outcome to the provider event', async () => {
    const order = buildOrder();
    const paymentGateway = {
      createRefund: jest.fn().mockResolvedValue({
        id: 're_123',
        status: 'succeeded',
        amount: 3000,
      }),
      retrieveRefund: jest.fn(),
    } as unknown as PaymentGateway;
    const refundRepository = buildRefundRepository();
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const notifyUserUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotifyUserUseCase>;
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const service = buildService({
      order,
      paymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher,
      notifyUserUseCase,
    });

    await service.processRefund('order-1');

    // The create response only acknowledges the request, even when it already
    // reads as succeeded; the refund fact keeps its provider id and stays open.
    expect(paymentGateway.createRefund).toHaveBeenCalledWith('pi_123', {
      idempotencyKey: 'order-refund-refund-1',
    });
    expect(refundRepository.attachProviderRefund).toHaveBeenCalledWith(
      'refund-1',
      're_123',
    );
    expect(refundRepository.markSucceeded).not.toHaveBeenCalled();
    expect(outboxService.createOrderRefundedEvent).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
    expect(order.status).toBe(OrderStatus.CANCELED);

    const settled = await service.applyProviderRefund({
      providerRefundId: 're_123',
      paymentIntentId: 'pi_123',
      status: 'succeeded',
      amountMinor: 3000,
    });

    expect(settled).toBe(true);
    expect(refundRepository.markSucceeded).toHaveBeenCalledWith(
      'refund-1',
      expect.objectContaining({
        providerRefundId: 're_123',
        refundedAmountMinor: 3000,
      }),
      expect.anything(),
    );
    expect(outboxService.createOrderRefundedEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        refundId: 'refund-1',
        orderId: 'order-1',
        refundedAmountMinor: 3000,
        currency: 'USD',
      }),
    );
    expect(jobDispatcher.dispatch).toHaveBeenNthCalledWith(1, 'order.send-refund-succeeded-email', { orderId: 'order-1' });
    expect(jobDispatcher.dispatch).toHaveBeenNthCalledWith(2, 'order.send-seller-order-update-email', {
      orderId: 'order-1',
      eventType: 'refunded',
    });
    expect(notifyUserUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'seller-1',
      type: 'seller.order.refund_succeeded',
      body: 'Refund for order ORD-20260604-000001 completed successfully.',
      data: expect.objectContaining({
        orderId: 'ord_1',
        orderNumber: 'ORD-20260604-000001',
        shopId: 'shop_1',
        refundStatus: 'succeeded',
      }),
    }));
    expect(order.status).toBe(OrderStatus.REFUNDED);
    expect(order.refundedAt).toBeInstanceOf(Date);
    expect(order.paymentDetails).toEqual(expect.objectContaining({
      payment_intent_id: 'pi_123',
      refund_status: 'succeeded',
      refund_id: 're_123',
      refund_amount: 30,
    }));
  });

  it('leaves the refund pending when the provider call has no known outcome', async () => {
    const order = buildOrder();
    const paymentGateway = {
      createRefund: jest.fn().mockRejectedValue(new Error('Stripe timeout')),
      retrieveRefund: jest.fn(),
    } as unknown as PaymentGateway;
    const refundRepository = buildRefundRepository();
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const notifyUserUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotifyUserUseCase>;
    const service = buildService({
      order,
      paymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher,
      notifyUserUseCase,
    });

    // A timeout may still have created the refund at the provider, so nothing
    // is recorded as a refusal; the retry reuses the same idempotency key.
    await expect(service.processRefund('order-1')).rejects.toThrow('Stripe timeout');

    expect(refundRepository.markFailed).not.toHaveBeenCalled();
    expect(refundRepository.attachProviderRefund).not.toHaveBeenCalled();
    expect(outboxService.createOrderRefundedEvent).not.toHaveBeenCalled();
    expect(order.paymentDetails).toEqual(expect.objectContaining({
      payment_intent_id: 'pi_123',
      refund_status: 'pending',
    }));
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('does not settle a refund twice when the provider event is replayed', async () => {
    const order = buildOrder();
    const refundRepository = buildRefundRepository({
      findByProviderRefundId: jest.fn().mockResolvedValue({
        id: 'refund-1',
        amountMinor: 3000,
        order: { id: 'order-1' },
      }),
      markSucceeded: jest.fn().mockResolvedValue(false),
    });
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const service = buildService({
      order,
      paymentGateway: { createRefund: jest.fn(), retrieveRefund: jest.fn() } as unknown as PaymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher,
      notifyUserUseCase: { execute: jest.fn().mockResolvedValue(undefined) } as unknown as NotifyUserUseCase,
    });

    await expect(service.applyProviderRefund({
      providerRefundId: 're_123',
      status: 'succeeded',
      amountMinor: 3000,
    })).resolves.toBe(false);

    expect(outboxService.createOrderRefundedEvent).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('finds the pending refund by payment intent when the event beats the create response', async () => {
    const order = buildOrder();
    const findByProviderRefundId = jest.fn().mockResolvedValue(null);
    const findPendingByPaymentIntentId = jest.fn().mockResolvedValue({
      id: 'refund-1',
      amountMinor: 3000,
      order: { id: 'order-1' },
    });
    const refundRepository = buildRefundRepository({
      findByProviderRefundId,
      findPendingByPaymentIntentId,
    });
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const service = buildService({
      order,
      paymentGateway: { createRefund: jest.fn(), retrieveRefund: jest.fn() } as unknown as PaymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher,
      notifyUserUseCase: { execute: jest.fn().mockResolvedValue(undefined) } as unknown as NotifyUserUseCase,
    });

    await expect(service.applyProviderRefund({
      providerRefundId: 're_123',
      paymentIntentId: 'pi_123',
      status: 'succeeded',
      amountMinor: 3000,
    })).resolves.toBe(true);

    expect(findByProviderRefundId).toHaveBeenCalledWith('re_123');
    expect(findPendingByPaymentIntentId).toHaveBeenCalledWith('pi_123');
    expect(refundRepository.markSucceeded).toHaveBeenCalledWith(
      'refund-1',
      expect.objectContaining({ providerRefundId: 're_123', refundedAmountMinor: 3000 }),
      expect.anything(),
    );
    expect(outboxService.createOrderRefundedEvent).toHaveBeenCalledTimes(1);
  });

  it('records a succeeded refund the app never requested against the Order that paid the intent', async () => {
    const order = buildOrder();
    const createPending = jest.fn().mockResolvedValue({
      id: 'refund-external',
      amountMinor: 3000,
      order: { id: 'order-1' },
    });
    const findOrderByPaymentIntentId = jest.fn().mockResolvedValue({
      id: 'order-1',
      currency: 'USD',
    });
    const refundRepository = buildRefundRepository({
      findByProviderRefundId: jest.fn().mockResolvedValue(null),
      findPendingByPaymentIntentId: jest.fn().mockResolvedValue(null),
      findOrderByPaymentIntentId,
      createPending,
    });
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const service = buildService({
      order,
      paymentGateway: { createRefund: jest.fn(), retrieveRefund: jest.fn() } as unknown as PaymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher,
      notifyUserUseCase: { execute: jest.fn().mockResolvedValue(undefined) } as unknown as NotifyUserUseCase,
    });

    await expect(service.applyProviderRefund({
      providerRefundId: 're_external',
      paymentIntentId: 'pi_123',
      status: 'succeeded',
      amountMinor: 3000,
    })).resolves.toBe(true);

    expect(findOrderByPaymentIntentId).toHaveBeenCalledWith('pi_123');
    expect(createPending).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-1',
      currency: 'USD',
      amountMinor: 3000,
    }));
    expect(refundRepository.markSucceeded).toHaveBeenCalledWith(
      'refund-external',
      expect.objectContaining({ providerRefundId: 're_external', refundedAmountMinor: 3000 }),
      expect.anything(),
    );
    expect(outboxService.createOrderRefundedEvent).toHaveBeenCalledTimes(1);
  });

  it('ignores an external refund no single Order can be attributed to', async () => {
    const order = buildOrder();
    const createPending = jest.fn();
    const refundRepository = buildRefundRepository({
      findByProviderRefundId: jest.fn().mockResolvedValue(null),
      findPendingByPaymentIntentId: jest.fn().mockResolvedValue(null),
      findOrderByPaymentIntentId: jest.fn().mockResolvedValue(null),
      createPending,
    });
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const service = buildService({
      order,
      paymentGateway: { createRefund: jest.fn(), retrieveRefund: jest.fn() } as unknown as PaymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher: { dispatch: jest.fn() } as unknown as JobDispatcher,
      notifyUserUseCase: { execute: jest.fn() } as unknown as NotifyUserUseCase,
    });

    await expect(service.applyProviderRefund({
      providerRefundId: 're_external',
      paymentIntentId: 'pi_shared',
      status: 'succeeded',
      amountMinor: 3000,
    })).resolves.toBe(false);

    expect(createPending).not.toHaveBeenCalled();
    expect(refundRepository.markSucceeded).not.toHaveBeenCalled();
    expect(outboxService.createOrderRefundedEvent).not.toHaveBeenCalled();
  });

  it('creates no fact for an external refund that has not succeeded', async () => {
    const order = buildOrder();
    const createPending = jest.fn();
    const findOrderByPaymentIntentId = jest.fn().mockResolvedValue({
      id: 'order-1',
      currency: 'USD',
    });
    const refundRepository = buildRefundRepository({
      findByProviderRefundId: jest.fn().mockResolvedValue(null),
      findPendingByPaymentIntentId: jest.fn().mockResolvedValue(null),
      findOrderByPaymentIntentId,
      createPending,
    });
    const service = buildService({
      order,
      paymentGateway: { createRefund: jest.fn(), retrieveRefund: jest.fn() } as unknown as PaymentGateway,
      refundRepository,
      outboxService: { createOrderRefundedEvent: jest.fn() } as unknown as OrderRefundOutboxService,
      jobDispatcher: { dispatch: jest.fn() } as unknown as JobDispatcher,
      notifyUserUseCase: { execute: jest.fn() } as unknown as NotifyUserUseCase,
    });

    await expect(service.applyProviderRefund({
      providerRefundId: 're_external',
      paymentIntentId: 'pi_123',
      status: 'pending',
      amountMinor: 3000,
    })).resolves.toBe(false);

    expect(findOrderByPaymentIntentId).not.toHaveBeenCalled();
    expect(createPending).not.toHaveBeenCalled();
  });

  it('does not republish a refund whose failure event is replayed', async () => {
    const order = buildOrder();
    const refundRepository = buildRefundRepository({
      findByProviderRefundId: jest.fn().mockResolvedValue({
        id: 'refund-1',
        amountMinor: 3000,
        order: { id: 'order-1' },
      }),
      markFailed: jest.fn().mockResolvedValue(false),
    });
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const notifyUserUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotifyUserUseCase;
    const service = buildService({
      order,
      paymentGateway: { createRefund: jest.fn(), retrieveRefund: jest.fn() } as unknown as PaymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher,
      notifyUserUseCase,
    });

    await expect(service.applyProviderRefund({
      providerRefundId: 're_123',
      status: 'failed',
      amountMinor: 3000,
      failureReason: 'declined',
    })).resolves.toBe(false);

    expect(refundRepository.markFailed).toHaveBeenCalledWith(
      'refund-1',
      expect.objectContaining({ failureReason: 'declined' }),
      expect.anything(),
    );
    expect(outboxService.createOrderRefundedEvent).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
    expect(notifyUserUseCase.execute).not.toHaveBeenCalled();
  });

  it('recovers pending refunds from the provider and retries the ones never requested', async () => {
    const order = buildOrder();
    const refundRepository = buildRefundRepository({
      findPendingBefore: jest.fn().mockResolvedValue([
        { id: 'refund-1', orderId: 'order-1', providerRefundId: 're_123' },
        { id: 'refund-2', orderId: 'order-2' },
      ]),
      findByProviderRefundId: jest.fn().mockResolvedValue({
        id: 'refund-1',
        amountMinor: 3000,
        order: { id: 'order-1' },
      }),
    });
    const paymentGateway = {
      createRefund: jest.fn(),
      retrieveRefund: jest.fn().mockResolvedValue({
        id: 're_123',
        status: 'succeeded',
        amount: 3000,
        failureReason: null,
      }),
    } as unknown as PaymentGateway;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const outboxService = {
      createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderRefundOutboxService;
    const service = buildService({
      order,
      paymentGateway,
      refundRepository,
      outboxService,
      jobDispatcher,
      notifyUserUseCase: { execute: jest.fn().mockResolvedValue(undefined) } as unknown as NotifyUserUseCase,
    });

    await expect(service.reconcilePendingRefunds()).resolves.toBe(1);

    expect(paymentGateway.retrieveRefund).toHaveBeenCalledWith('re_123');
    expect(refundRepository.markSucceeded).toHaveBeenCalledWith(
      'refund-1',
      expect.objectContaining({ providerRefundId: 're_123', refundedAmountMinor: 3000 }),
      expect.anything(),
    );
    // No deduplication key: a retained failed job must not swallow the retry.
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.process-refund',
      { orderId: 'order-2' },
    );
  });

  it('resolves and reserves the remaining refund under the locked order transaction', async () => {
    const order = buildOrder();
    const createPending = jest.fn().mockResolvedValue({ id: 'refund-2', amountMinor: 3000 });
    const findByIdForUpdate = jest.fn().mockResolvedValue(order);
    const refundRepository = buildRefundRepository({
      findPendingByOrderId: jest.fn().mockResolvedValue(null),
      createPending,
      sumAmountMinorByStatus: jest.fn().mockResolvedValue(0),
    });
    const service = buildService({
      order,
      paymentGateway: {
        createRefund: jest.fn().mockResolvedValue({ id: 're_2', status: 'succeeded', amount: 3000 }),
      } as unknown as PaymentGateway,
      refundRepository,
      orderRefundQueryRepository: {
        findById: jest.fn().mockResolvedValue(order),
        findByIdForUpdate,
        findByPublicId: jest.fn(),
        findByIdWithShopOwner: jest.fn().mockResolvedValue(order),
      } as unknown as OrderRefundQueryRepository,
      outboxService: { createOrderRefundedEvent: jest.fn().mockResolvedValue(undefined) } as unknown as OrderRefundOutboxService,
      jobDispatcher: { dispatch: jest.fn().mockResolvedValue(undefined) } as unknown as JobDispatcher,
      notifyUserUseCase: { execute: jest.fn().mockResolvedValue(undefined) } as unknown as NotifyUserUseCase,
    });

    await service.processRefund('order-1');

    expect(findByIdForUpdate).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ entityManager: expect.anything() }),
    );
    expect(createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        currency: 'USD',
        amountMinor: 3000,
      }),
      expect.objectContaining({ entityManager: expect.anything() }),
    );
  });

  it('does not reserve a refund when the locked Order is no longer requesting one', async () => {
    const order = buildOrder();
    const createPending = jest.fn();
    const refundRepository = buildRefundRepository({
      findPendingByOrderId: jest.fn().mockResolvedValue(null),
      createPending,
    });
    const service = buildService({
      order,
      paymentGateway: { createRefund: jest.fn() } as unknown as PaymentGateway,
      refundRepository,
      orderRefundQueryRepository: {
        findById: jest.fn().mockResolvedValue(order),
        findByIdForUpdate: jest.fn().mockResolvedValue(buildOrder({
          paymentDetails: { payment_intent_id: 'pi_123', refund_status: 'succeeded' },
        })),
        findByPublicId: jest.fn(),
        findByIdWithShopOwner: jest.fn().mockResolvedValue(order),
      } as unknown as OrderRefundQueryRepository,
      outboxService: {} as OrderRefundOutboxService,
      jobDispatcher: {} as JobDispatcher,
      notifyUserUseCase: {} as NotifyUserUseCase,
    });

    await service.processRefund('order-1');

    expect(createPending).not.toHaveBeenCalled();
  });
});
