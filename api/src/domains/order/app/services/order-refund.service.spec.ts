import type { EntityManager } from '@mikro-orm/postgresql';
import type { ModuleRef } from '@nestjs/core';
import type { PaymentGateway } from '../../../../integrations/payment/app/ports/payment-gateway';
import type { NotifyUserUseCase } from '../../../../domains/notification/app/use-cases/notify-user/notify-user.use-case';
import type { JobDispatcher } from '../../../../integrations/queue/app/ports/job-dispatcher';
import { PaymentType } from '../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import type { OrderRefundQueryRepository } from '../ports/order-refund-query.repository';
import { OrderRefundService } from './order-refund.service';

describe('OrderRefundService', () => {
  it('marks paid card cancellations as refund pending', () => {
    const moduleRef = {
      get: jest.fn(),
    } as unknown as ModuleRef;
    const service = new OrderRefundService(
      {} as EntityManager,
      {} as PaymentGateway,
      moduleRef,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {
        findById: jest.fn(),
        findByIdWithShopOwner: jest.fn(),
      } as unknown as OrderRefundQueryRepository,
    );
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

  it('processes a refund and marks the order refunded', async () => {
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-20260604-000001',
      paymentType: PaymentType.CARD,
      currency: 'USD',
      status: OrderStatus.CANCELED,
      refundedAt: undefined,
      shop: {
        id: 'shop-1',
        ownerUser: {
          id: 'seller-1',
        },
      },
      paymentDetails: {
        payment_intent_id: 'pi_123',
        refund_status: 'pending',
      },
    };
    const transactionalEntityManager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(order),
      })),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      fork: jest.fn(() => ({
        getRepository: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue(order),
        })),
      })),
      transactional: jest.fn(async (callback) => await callback(transactionalEntityManager)),
    } as unknown as EntityManager;
    const paymentGateway = {
      createRefund: jest.fn().mockResolvedValue({
        id: 're_123',
        status: 'succeeded',
        amount: 3000,
      }),
    } as unknown as PaymentGateway;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const notifyUserUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotifyUserUseCase>;
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (typeof token === 'function' && token.name === 'NotifyUserUseCase') {
          return notifyUserUseCase;
        }
        return jobDispatcher;
      }),
    } as unknown as ModuleRef;
    const service = new OrderRefundService(
      entityManager,
      paymentGateway,
      moduleRef,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {
        findById: jest.fn().mockResolvedValue(order),
        findByIdWithShopOwner: jest.fn().mockResolvedValue(order),
      } as unknown as OrderRefundQueryRepository,
    );

    await service.processRefund('order-1');

    expect(paymentGateway.createRefund).toHaveBeenCalledWith('pi_123');
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
        orderId: 'order-1',
        orderNumber: 'ORD-20260604-000001',
        shopId: 'shop-1',
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

  it('sends a failure notification when the refund fails', async () => {
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-20260604-000001',
      paymentType: PaymentType.CARD,
      currency: 'USD',
      status: OrderStatus.CANCELED,
      refundedAt: undefined,
      shop: {
        id: 'shop-1',
        ownerUser: {
          id: 'seller-1',
        },
      },
      paymentDetails: {
        payment_intent_id: 'pi_123',
        refund_status: 'pending',
      },
    };
    const transactionalEntityManager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(order),
      })),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      fork: jest.fn(() => ({
        getRepository: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue(order),
        })),
      })),
      transactional: jest.fn(async (callback) => await callback(transactionalEntityManager)),
    } as unknown as EntityManager;
    const paymentGateway = {
      createRefund: jest.fn().mockRejectedValue(new Error('Stripe timeout')),
    } as unknown as PaymentGateway;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as JobDispatcher;
    const notifyUserUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotifyUserUseCase>;
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (typeof token === 'function' && token.name === 'NotifyUserUseCase') {
          return notifyUserUseCase;
        }
        return jobDispatcher;
      }),
    } as unknown as ModuleRef;
    const service = new OrderRefundService(
      entityManager,
      paymentGateway,
      moduleRef,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {
        findById: jest.fn().mockResolvedValue(order),
        findByIdWithShopOwner: jest.fn().mockResolvedValue(order),
      } as unknown as OrderRefundQueryRepository,
    );

    await service.processRefund('order-1');

    expect(order.paymentDetails).toEqual(expect.objectContaining({
      payment_intent_id: 'pi_123',
      refund_status: 'failed',
      refund_failed_reason: 'Stripe timeout',
    }));
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith('order.send-refund-failed-email', {
      orderId: 'order-1',
    });
    expect(notifyUserUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'seller-1',
      type: 'seller.order.refund_failed',
      body: 'Refund for order ORD-20260604-000001 failed and needs attention.',
      data: expect.objectContaining({
        orderId: 'order-1',
        orderNumber: 'ORD-20260604-000001',
        shopId: 'shop-1',
        refundStatus: 'failed',
      }),
    }));
  });

});
