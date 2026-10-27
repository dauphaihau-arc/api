import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { fromMinorUnits } from '~/platform/money/money';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  FINANCE_CONFIG,
  type FinanceConfig,
} from '~/platform/config/finance.config';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { RecordOrderRefundJournalEntryUseCase } from '~/domains/finance/app/use-cases/record-order-refund-journal-entry/record-order-refund-journal-entry.use-case';
import type { UpdateAdminOrderRefundDto } from '../../../api/rest/dto/update-admin-order-refund.dto';
import { AdminOrderRefundAction } from '../../../api/rest/dto/update-admin-order-refund.dto';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderEventsService } from '../../services/order-events.service';
import { OrderRefundOutboxService } from '../../services/order-refund-outbox.service';
import {
  buildOrderRefundEvent,
  type OrderRefundEventInput,
} from '../../events/order-refund.event';
import { OrderRefundRepository } from '../../ports/order-refund.repository';
import { OrderRefundStatus } from '../../../domain/enums/order-refund-status.enum';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import { canceledFulfillmentOrderIds } from '../../order-fulfillment';
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
    private readonly orderEventsService: OrderEventsService,
    private readonly orderRefundRepository: OrderRefundRepository,
    private readonly orderRefundOutboxService: OrderRefundOutboxService,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
    private readonly auditLogService: AuditLogService,
    private readonly recordOrderRefundJournalEntryUseCase: RecordOrderRefundJournalEntryUseCase,
    @Inject(FINANCE_CONFIG) private readonly financeConfig: FinanceConfig,
  ) {}

  async execute(
    orderId: string,
    input: UpdateAdminOrderRefundDto,
  ): Promise<AdminOrderDetail> {
    const entityManager = this.entityManager.fork();

    const result = await entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        buildOrderIdentifierWhere(orderId),
        { populate: ['shop', 'user'], lockMode: LockMode.PESSIMISTIC_WRITE },
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
      const pendingRefund = await this.orderRefundRepository.findPendingByOrderId(
        order.id,
        { entityManager: transactionalEntityManager },
      );
      const refundFailureReason = input.reason?.trim()
        || 'Manual refund review required';

      if (input.action === AdminOrderRefundAction.MARK_FAILED) {
        await this.failPendingRefund(
          transactionalEntityManager,
          pendingRefund?.id,
          refundFailureReason,
          now,
        );
      }

      if (input.action === AdminOrderRefundAction.MARK_NOT_REQUIRED) {
        await this.failPendingRefund(
          transactionalEntityManager,
          pendingRefund?.id,
          input.reason?.trim() || 'Refund not required',
          now,
        );
      }

      const succeedsNow =
        input.action === AdminOrderRefundAction.MARK_SUCCEEDED;
      const requestsProviderRefund =
        input.action === AdminOrderRefundAction.RETRY;
      let succeededAmountMinor: number | undefined;

      if (succeedsNow || requestsProviderRefund) {
        const [alreadySucceededMinor, alreadyPendingMinor] = await Promise.all([
          this.orderRefundRepository.sumAmountMinorByStatus(
            order.id,
            [OrderRefundStatus.SUCCEEDED],
            { entityManager: transactionalEntityManager },
          ),
          this.orderRefundRepository.sumAmountMinorByStatus(
            order.id,
            [OrderRefundStatus.PENDING],
            { entityManager: transactionalEntityManager },
          ),
        ]);

        // Marking an already-requested refund succeeded uses that request's own
        // amount; otherwise the operator returns the whole remaining amount.
        const pendingAfterActionMinor = requestsProviderRefund
          ? alreadyPendingMinor
          : alreadyPendingMinor - (pendingRefund?.amountMinor ?? 0);

        const amountMinor = (!requestsProviderRefund && pendingRefund)
          ? pendingRefund.amountMinor
          : order.totalMinor - alreadySucceededMinor - pendingAfterActionMinor;

        if (amountMinor <= 0) {
          throw new AdminRefundActionNotAllowedError();
        }

        if (requestsProviderRefund) {
          await this.orderRefundRepository.createPending(
            {
              orderId: order.id,
              currency: order.currency,
              amountMinor,
              requestedAt: now,
            },
            { entityManager: transactionalEntityManager },
          );
        }
        else {
          succeededAmountMinor = amountMinor;
          const refund = pendingRefund ??
            await this.orderRefundRepository.createPending(
              {
                orderId: order.id,
                currency: order.currency,
                amountMinor,
                requestedAt: now,
              },
              { entityManager: transactionalEntityManager },
            );

          const marked = await this.orderRefundRepository.markSucceeded(
            refund.id,
            {
              refundedAmountMinor: amountMinor,
              completedAt: now,
            },
            { entityManager: transactionalEntityManager },
          );

          if (marked) {
            const refundEvent: OrderRefundEventInput = {
              refundId: refund.id,
              orderId: order.id,
              orderPublicId: order.publicId,
              shopId: order.shop.id,
              currency: order.currency,
              refundedAmountMinor: amountMinor,
              occurredAt: now,
            };

            const orderRefundedOutboxEvent =
              await this.orderRefundOutboxService.createOrderRefundedEvent(
                transactionalEntityManager,
                refundEvent,
              );

            // `inline` books the refund journal entry inside the producer's
            // transaction, so a booking failure rolls the admin refund back and
            // the request can be retried. The outbox row is kept and marked
            // processed as evidence, and the worker skips it.
            if (this.financeConfig.moneyEventBooking === 'inline') {
              await this.recordOrderRefundJournalEntryUseCase.recordWithin(
                transactionalEntityManager,
                buildOrderRefundEvent(refundEvent),
              );
              orderRefundedOutboxEvent.status = OutboxEventStatus.PROCESSED;
              orderRefundedOutboxEvent.processedAt = now;
            }
          }
        }
      }

      if (requestsProviderRefund) {
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

      if (succeedsNow) {
        const succeededTotal = await this.orderRefundRepository
          .sumAmountMinorByStatus(
            order.id,
            [OrderRefundStatus.SUCCEEDED],
            { entityManager: transactionalEntityManager },
          );
        const fullyRefunded = succeededTotal >= order.totalMinor;

        order.status = fullyRefunded ? OrderStatus.REFUNDED : OrderStatus.CANCELED;
        order.refundedAt = now;
        order.paymentDetails = {
          ...order.paymentDetails,
          refund_status: 'succeeded' satisfies RefundStatus,
          refund_amount: fromMinorUnits(succeededAmountMinor ?? 0, order.currency),
          refunded_total_amount: fromMinorUnits(succeededTotal, order.currency),
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
          refund_failed_reason: refundFailureReason,
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
          ...(succeededAmountMinor !== undefined
            ? {
              refund_amount: fromMinorUnits(succeededAmountMinor, order.currency),
              refund_amount_minor: succeededAmountMinor,
              full_refund: order.status === OrderStatus.REFUNDED,
            }
            : {}),
        },
      });

      await transactionalEntityManager.flush();

      const items = await transactionalEntityManager.getRepository(OrderItemEntity).find(
        { order: order.id },
        { populate: ['product', 'product.shop', 'inventory'] },
      );

      return {
        shouldDispatchRetry: input.action === AdminOrderRefundAction.RETRY,
        refundStatus: this.getRefundStatus(order.paymentDetails),
        customerUserId: order.user?.id,
        notificationAction:
          input.action === AdminOrderRefundAction.MARK_SUCCEEDED
            ? 'refund_succeeded'
            : input.action === AdminOrderRefundAction.MARK_FAILED
              ? 'refund_failed'
              : undefined,
        detail: toAdminOrderDetail(
          order,
          items,
          (await this.orderFulfillmentViewPort.load(transactionalEntityManager, [order.id], {
            canceledOrderIds: canceledFulfillmentOrderIds([order]),
          })).get(order.id),
        ),
      };
    });

    await this.auditLogService.record({
      action: 'order.refund.updated',
      entityType: 'order',
      entityId: result.detail.id,
      entityPublicId: result.detail.publicId,
      summary: {
        action: input.action,
        refundStatus: result.refundStatus,
      },
    });

    if (result.customerUserId) {
      this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
        userId: result.customerUserId,
        orderId: result.detail.publicId,
        changed: ['status', 'refundStatus'],
        status: result.detail.status,
      });
    }

    if (result.shouldDispatchRetry) {
      try {
        await this.jobDispatcher.dispatch(
          'order.process-refund',
          { orderId: result.detail.id },
          { deduplicationKey: appJobDeduplicationKey.processOrderRefund(result.detail.id) },
        );
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule admin refund retry for order ${result.detail.id}`,
          error instanceof Error ? error.stack : undefined,
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
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return result.detail;
  }

  private async failPendingRefund(
    entityManager: EntityManager,
    refundId: string | undefined,
    reason: string,
    at: Date,
  ): Promise<void> {
    if (!refundId) {
      return;
    }

    await this.orderRefundRepository.markFailed(
      refundId,
      { failureReason: reason, completedAt: at },
      { entityManager },
    );
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
    action: AdminOrderRefundAction,
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
