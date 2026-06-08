import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { appJobDeduplicationKey } from '~/common/jobs/job.types';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import type { UpdateAdminOrderRefundDto } from '../../../api/rest/dto/update-admin-order-refund.dto';
import { AdminOrderRefundAction } from '../../../api/rest/dto/update-admin-order-refund.dto';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderEventsService } from '../../order-events.service';
import { toAdminOrderDetail } from '../../admin-order-read-model';
import { buildOrderIdentifierWhere } from '../../order-identifier';
import {
  AdminRefundActionNotAllowedError,
  AdminRefundNotAllowedError,
  AdminRefundRequiresCardPaymentError,
  OrderNotFoundError,
} from '../../errors/order-app.error';
import { ORDER_UPDATED_SSE_EVENT } from '../../events/order-sse.event';
import type { AdminOrderDetail } from '../../order.types';

type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'not_required';

@Injectable()
export class UpdateAdminOrderRefundUseCase {
  private readonly logger = new Logger(UpdateAdminOrderRefundUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
    private readonly eventEmitter: EventEmitter2,
    private readonly orderEventsService: OrderEventsService
  ) {}

  async execute(
    orderId: string,
    input: UpdateAdminOrderRefundDto
  ): Promise<AdminOrderDetail> {
    const entityManager = this.entityManager.fork();

    const result = await entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        buildOrderIdentifierWhere(orderId),
        { populate: ['shop', 'user'] }
      );

      if (!order) {
        throw new OrderNotFoundError();
      }

      if (order.paymentType !== PaymentType.CARD) {
        throw new AdminRefundRequiresCardPaymentError();
      }

      const refundStatus = this.getRefundStatus(order.paymentDetails);
      this.assertRefundActionAllowed(order.status, refundStatus, input.action);

      const now = new Date();
      const previousStatus = order.status;

      if (input.action === AdminOrderRefundAction.RETRY) {
        order.status = OrderStatus.CANCELED;
        order.refundedAt = undefined;
        order.paymentDetails = {
          ...order.paymentDetails,
          refund_status: 'pending' satisfies RefundStatus,
          refund_requested_at: now.toISOString(),
          refund_failed_reason: undefined,
          refunded_at: undefined,
          refund_note: undefined,
        };
      }

      if (input.action === AdminOrderRefundAction.MARK_SUCCEEDED) {
        order.status = OrderStatus.REFUNDED;
        order.refundedAt = now;
        order.paymentDetails = {
          ...order.paymentDetails,
          refund_status: 'succeeded' satisfies RefundStatus,
          refund_failed_reason: undefined,
          refunded_at: now.toISOString(),
          refund_note: undefined,
        };
      }

      if (input.action === AdminOrderRefundAction.MARK_FAILED) {
        order.status = OrderStatus.CANCELED;
        order.refundedAt = undefined;
        order.paymentDetails = {
          ...order.paymentDetails,
          refund_status: 'failed' satisfies RefundStatus,
          refund_failed_reason: input.reason?.trim() || 'Manual refund review required',
          refunded_at: undefined,
          refund_note: undefined,
        };
      }

      if (input.action === AdminOrderRefundAction.MARK_NOT_REQUIRED) {
        order.status = OrderStatus.CANCELED;
        order.refundedAt = undefined;
        order.paymentDetails = {
          ...order.paymentDetails,
          refund_status: 'not_required' satisfies RefundStatus,
          refund_failed_reason: undefined,
          refunded_at: undefined,
          refund_note: input.reason?.trim() || 'Refund not required',
        };
      }

      await this.orderEventsService.record(transactionalEntityManager, {
        order,
        type: input.action === AdminOrderRefundAction.MARK_SUCCEEDED
          ? OrderEventType.REFUND_SUCCEEDED
          : input.action === AdminOrderRefundAction.MARK_FAILED
            ? OrderEventType.REFUND_FAILED
            : input.action === AdminOrderRefundAction.MARK_NOT_REQUIRED
              ? OrderEventType.REFUND_NOT_REQUIRED
              : OrderEventType.REFUND_REQUESTED,
        actorType: OrderEventActorType.ADMIN,
        actorId: undefined,
        source: 'admin_order_refund',
        occurredAt: now,
        payload: {
          from_status: previousStatus,
          to_status: order.status,
          reason: input.reason?.trim() || undefined,
        },
      });

      await transactionalEntityManager.flush();

      const items = await transactionalEntityManager.getRepository(OrderItemEntity).find(
        { order: order.id },
        { populate: ['product', 'product.shop', 'inventory'] }
      );

      return {
        shouldDispatchRetry: input.action === AdminOrderRefundAction.RETRY,
        customerUserId: order.user?.id,
        notificationAction:
          input.action === AdminOrderRefundAction.MARK_SUCCEEDED
            ? 'refund_succeeded'
            : input.action === AdminOrderRefundAction.MARK_FAILED
              ? 'refund_failed'
              : undefined,
        detail: toAdminOrderDetail(order, items),
      };
    });

    if (result.customerUserId) {
      this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
        userId: result.customerUserId,
        orderId: result.detail.id,
        changed: ['status', 'refundStatus'],
        status: result.detail.status,
        shippingStatus: result.detail.shippingStatus,
      });
    }

    if (result.shouldDispatchRetry) {
      try {
        await this.jobDispatcher.dispatch(
          'order.process-refund',
          { orderId: result.detail.id },
          { deduplicationKey: appJobDeduplicationKey.processOrderRefund(result.detail.id) }
        );
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule admin refund retry for order ${result.detail.id}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    if (result.notificationAction) {
      try {
        if (result.notificationAction === 'refund_succeeded') {
          await this.jobDispatcher.dispatch('order.send-refund-succeeded-email', { orderId: result.detail.id });
          await this.jobDispatcher.dispatch('order.send-seller-order-update-email', {
            orderId: result.detail.id,
            eventType: 'refunded',
          });
        }
        else {
          await this.jobDispatcher.dispatch('order.send-refund-failed-email', { orderId: result.detail.id });
        }
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule admin refund notification for order ${result.detail.id}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    return result.detail;
  }

  private getRefundStatus(paymentDetails?: Record<string, unknown>): RefundStatus | undefined {
    const value = paymentDetails?.['refund_status'];

    if (
      value === 'pending'
      || value === 'succeeded'
      || value === 'failed'
      || value === 'not_required'
    ) {
      return value;
    }

    return undefined;
  }

  private assertRefundActionAllowed(
    orderStatus: OrderStatus,
    refundStatus: RefundStatus | undefined,
    action: AdminOrderRefundAction
  ): void {
    if ([OrderStatus.CHECKOUT_PENDING, OrderStatus.AWAITING_PAYMENT, OrderStatus.EXPIRED].includes(orderStatus)) {
      throw new AdminRefundNotAllowedError();
    }

    if (action === AdminOrderRefundAction.RETRY) {
      if (orderStatus !== OrderStatus.CANCELED || refundStatus !== 'failed') {
        throw new AdminRefundActionNotAllowedError();
      }

      return;
    }

    if (![OrderStatus.CANCELED, OrderStatus.REFUNDED].includes(orderStatus)) {
      throw new AdminRefundActionNotAllowedError();
    }
  }
}
