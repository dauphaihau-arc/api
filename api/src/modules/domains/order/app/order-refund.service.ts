import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { fromMinorUnits } from '~/common/utils/money';
import { PaymentGateway } from '~/modules/shared/payment/app/ports/payment-gateway';
import { NotifyUserUseCase } from '~/modules/shared/notification/app/use-cases/notify-user/notify-user.use-case';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import { PaymentType } from '../domain/enums/payment-type.enum';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import {
  buildSellerOrderRefundNotification,
  getSellerOrderNotificationRecipientId,
} from './seller-order-notification';
import { getRequiredOrderNumber } from './order-number';

type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'not_required';

@Injectable()
export class OrderRefundService {
  private readonly logger = new Logger(OrderRefundService.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly paymentGateway: PaymentGateway,
    private readonly moduleRef: ModuleRef
  ) {}

  prepareRefundOnCancellation(
    order: OrderEntity,
    previousStatus: OrderStatus,
    now: Date
  ): boolean {
    const shouldRefund = (
      order.paymentType === PaymentType.CARD
      && previousStatus === OrderStatus.PAID
    );

    if (!shouldRefund) {
      return false;
    }

    order.paymentDetails = {
      ...order.paymentDetails,
      refund_status: 'pending' satisfies RefundStatus,
      refund_requested_at: now.toISOString(),
      refund_failed_reason: undefined,
    };

    return true;
  }

  async processRefund(orderId: string): Promise<void> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne({ id: orderId });

    if (!order || order.paymentType !== PaymentType.CARD) {
      return;
    }

    const paymentDetails = order.paymentDetails ?? {};
    if (paymentDetails['refund_status'] === 'succeeded') {
      return;
    }

    const paymentIntentId = typeof paymentDetails['payment_intent_id'] === 'string'
      ? paymentDetails['payment_intent_id']
      : undefined;

    if (!paymentIntentId) {
      await this.markRefundFailed(orderId, 'Missing payment intent for refund');
      return;
    }

    try {
      const refund = await this.paymentGateway.createStripeRefund(paymentIntentId);
      const refundStatus = refund.status === 'succeeded' ? 'succeeded' : 'failed';
      await this.markRefundResult(orderId, {
        refundStatus: refund.status === 'succeeded' ? 'succeeded' : 'failed',
        refundId: refund.id,
        refundAmount: this.fromStripeAmount(refund.amount, order.currency),
        refundedAt: refund.status === 'succeeded' ? new Date() : undefined,
        refundFailedReason: refund.status === 'succeeded'
          ? undefined
          : refund.failureReason ?? `Stripe refund status: ${refund.status}`,
      });
      await this.dispatchRefundNotification(orderId, refundStatus);
    }
    catch (error) {
      await this.markRefundFailed(
        orderId,
        error instanceof Error ? error.message : 'Unknown refund error'
      );
      await this.dispatchRefundNotification(orderId, 'failed');
    }
  }

  private async markRefundFailed(orderId: string, reason: string): Promise<void> {
    await this.markRefundResult(orderId, {
      refundStatus: 'failed',
      refundFailedReason: reason,
    });
  }

  private async markRefundResult(
    orderId: string,
    input: {
      refundStatus: RefundStatus;
      refundId?: string;
      refundAmount?: number;
      refundedAt?: Date;
      refundFailedReason?: string;
    }
  ): Promise<void> {
    await this.entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        { id: orderId },
        { populate: ['shop.ownerUser'] }
      );

      if (!order) {
        return;
      }

      order.paymentDetails = {
        ...order.paymentDetails,
        refund_status: input.refundStatus,
        ...(input.refundId ? { refund_id: input.refundId } : {}),
        ...(input.refundAmount !== undefined ? { refund_amount: input.refundAmount } : {}),
        ...(input.refundedAt ? { refunded_at: input.refundedAt.toISOString() } : {}),
        ...(input.refundFailedReason
          ? { refund_failed_reason: input.refundFailedReason }
          : { refund_failed_reason: undefined }),
      };

      if (input.refundStatus === 'succeeded') {
        order.refundedAt = input.refundedAt ?? new Date();
        order.status = OrderStatus.REFUNDED;
      }

      await transactionalEntityManager.flush();
    });
  }

  private fromStripeAmount(amount: number, currency: string): number {
    return fromMinorUnits(amount, currency);
  }

  private async dispatchRefundNotification(
    orderId: string,
    refundStatus: 'succeeded' | 'failed'
  ): Promise<void> {
    try {
      const jobDispatcher = this.moduleRef.get(JobDispatcher, {
        strict: false,
      });

      if (refundStatus === 'succeeded') {
        await jobDispatcher.dispatch('order.send-refund-succeeded-email', { orderId });
        await jobDispatcher.dispatch('order.send-seller-order-update-email', {
          orderId,
          eventType: 'refunded',
        });
      }
      else {
        await jobDispatcher.dispatch('order.send-refund-failed-email', { orderId });
      }

      const notifyUserUseCase = this.moduleRef.get(NotifyUserUseCase, {
        strict: false,
      });
      const order = await this.entityManager
        .fork()
        .getRepository(OrderEntity)
        .findOne({ id: orderId }, { populate: ['shop.ownerUser'] });
      const sellerUserId = order
        ? getSellerOrderNotificationRecipientId(order)
        : null;

      if (order && sellerUserId && notifyUserUseCase) {
        await notifyUserUseCase.execute(
          buildSellerOrderRefundNotification(
            sellerUserId,
            orderId,
            getRequiredOrderNumber(order),
            order.shop.id,
            refundStatus
          )
        );
      }
    }
    catch (error) {
      this.logger.error(
        `Failed to schedule refund notification for order ${orderId}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}
