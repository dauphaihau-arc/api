import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import ms from 'ms';
import { fromMinorUnits } from '../../../../platform/money/money';
import {
  FINANCE_CONFIG,
  type FinanceConfig,
} from '../../../../platform/config/finance.config';
import { OutboxEventStatus } from '../../../../platform/outbox/outbox-event.entity';
import { PaymentGateway } from '../../../../integrations/payment/app/ports/payment-gateway';
import { NotifyUserUseCase } from '../../../../domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { JobDispatcher } from '../../../../integrations/queue/app/ports/job-dispatcher';
import { RecordOrderRefundJournalEntryUseCase } from '../../../finance/app/use-cases/record-order-refund-journal-entry/record-order-refund-journal-entry.use-case';
import { OrderEventActorType } from '../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../domain/enums/order-event-type.enum';
import { OrderRefundStatus } from '../../domain/enums/order-refund-status.enum';
import { PaymentType } from '../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderEntity } from '../../infra/persistence/entities/order.entity';
import type { OrderRefundEntity } from '../../infra/persistence/entities/order-refund.entity';
import { OrderEventsService } from './order-events.service';
import { OrderRefundOutboxService } from './order-refund-outbox.service';
import {
  buildOrderRefundEvent,
  type OrderRefundEventInput,
} from '../events/order-refund.event';
import {
  buildSellerOrderRefundNotification,
  getSellerOrderNotificationRecipientId,
} from '../seller-order-notification';
import { getRequiredOrderNumber } from '../order-number';
import { OrderRefundQueryRepository } from '../ports/order-refund-query.repository';
import { OrderRefundRepository } from '../ports/order-refund.repository';

type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'not_required';

const PROVIDER_REFUND_SUCCEEDED = 'succeeded';

/** How long a pending refund may wait before the sweep revisits it. */
const PENDING_REFUND_RECONCILIATION_MS = ms('10m');

/**
 * One provider refund report. `paymentIntentId` is present on a webhook event
 * and absent on a status read, where the refund id already resolves the fact.
 */
export interface ProviderRefundUpdate {
  providerRefundId: string;
  paymentIntentId?: string;
  status: string;
  amountMinor?: number;
  failureReason?: string | null;
}

/**
 * Requests an Order Refund from the payment provider and records the provider's
 * final outcome as an Order Refund fact.
 *
 * A refund always returns the whole remaining charge in the currency the buyer
 * paid: the provider is asked for no amount and reports back what it returned.
 * The `refunds.create` response is only an acknowledgement — a refund can be
 * created as `pending` and be confirmed or refused later — so the final outcome
 * comes from the provider's `refund.*` events, with a reconciliation sweep for a
 * missed one. Only a succeeded refund becomes a durable money event keyed by the
 * refund fact, which is what Finance posts; a refusal emits no money event, so
 * no balance ever moves for money the provider did not return.
 */
@Injectable()
export class OrderRefundService {
  private readonly logger = new Logger(OrderRefundService.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly paymentGateway: PaymentGateway,
    private readonly moduleRef: ModuleRef,
    private readonly orderEventsService: OrderEventsService,
    private readonly orderRefundQueryRepository: OrderRefundQueryRepository,
    private readonly orderRefundRepository: OrderRefundRepository,
    private readonly orderRefundOutboxService: OrderRefundOutboxService,
    private readonly recordOrderRefundJournalEntryUseCase: RecordOrderRefundJournalEntryUseCase,
    @Inject(FINANCE_CONFIG) private readonly financeConfig: FinanceConfig,
  ) {}

  prepareRefundOnCancellation(
    order: OrderEntity,
    previousStatus: OrderStatus,
    now: Date,
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
    const order = await this.orderRefundQueryRepository.findById(orderId);

    if (!order || order.paymentType !== PaymentType.CARD) {
      return;
    }

    const requestedRefund = await this.resolveRefundToProcess(order);

    if (!requestedRefund) {
      return;
    }

    const paymentIntentId = this.readString(order.paymentDetails, 'payment_intent_id');

    if (!paymentIntentId) {
      await this.markRefundFailed(
        orderId,
        requestedRefund.id,
        'Missing payment intent for refund',
      );
      return;
    }

    try {
      const refund = await this.paymentGateway.createRefund(paymentIntentId, {
        idempotencyKey: `order-refund-${requestedRefund.id}`,
      });

      // The response only acknowledges the request: Stripe may create the
      // refund as `pending`, and even a `succeeded` answer is confirmed by the
      // provider's own `refund.*` event. Recording the id here is what lets that
      // event find this fact, including when it lands before this call returns.
      await this.orderRefundRepository.attachProviderRefund(
        requestedRefund.id,
        refund.id,
      );
    }
    catch (error) {
      // The provider may still have created the refund, so the fact stays
      // pending: the idempotency key makes the retry safe, and the event or the
      // reconciliation sweep settles it. An unknown outcome is never recorded
      // as a refusal.
      this.logger.error(
        `Refund ${requestedRefund.id} for order ${orderId} could not be created and stays pending`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Applies the provider's report of one refund. A `refund.*` event is matched
   * by the provider's refund id; when the event beats the create response, the
   * Order's pending fact is found through the payment intent instead. A
   * succeeded refund issued outside the app has no fact at all, and is recorded
   * against the single Order that paid the intent. Only the transition out of
   * `pending` has an effect, so replayed or out-of-order events leave a settled
   * refund alone.
   */
  async applyProviderRefund(update: ProviderRefundUpdate): Promise<boolean> {
    // Prefer the fact the provider id already identifies; fall back to the
    // Order's pending fact when the event beat the create response.
    let refund = await this.orderRefundRepository.findByProviderRefundId(
      update.providerRefundId,
    );

    if (!refund && update.paymentIntentId) {
      refund = await this.orderRefundRepository.findPendingByPaymentIntentId(
        update.paymentIntentId,
      );
    }

    if (!refund) {
      if (update.status === PROVIDER_REFUND_SUCCEEDED) {
        return this.settleExternalRefund(update);
      }

      this.logger.warn(
        `No Order Refund matches provider refund ${update.providerRefundId}; ignoring its ${update.status} event`,
      );
      return false;
    }

    const orderId = refund.order.id;

    if (update.status === PROVIDER_REFUND_SUCCEEDED) {
      // The provider's own amount is the fact; an event that reports none falls
      // back to the amount the request recorded.
      return this.markRefundSucceeded(orderId, refund.id, {
        providerRefundId: update.providerRefundId,
        refundedAmountMinor: update.amountMinor && update.amountMinor > 0
          ? update.amountMinor
          : refund.amountMinor,
      });
    }

    if (update.status === 'failed' || update.status === 'canceled') {
      return this.markRefundFailed(
        orderId,
        refund.id,
        update.failureReason?.trim()
          || `Provider refund status: ${update.status}`,
        update.providerRefundId,
      );
    }

    // `pending` or `requires_action`: record the provider's id and wait for the
    // event that settles it.
    await this.orderRefundRepository.attachProviderRefund(
      refund.id,
      update.providerRefundId,
    );

    return false;
  }

  /**
   * Recovers refunds whose provider event never arrived: a refund that already
   * has a provider id is re-read and settled, and one whose refund job was lost
   * is requested again under the same idempotency key. Returns how many reached
   * an outcome.
   */
  async reconcilePendingRefunds(limit = 10): Promise<number> {
    const pending = await this.orderRefundRepository.findPendingBefore(
      new Date(Date.now() - PENDING_REFUND_RECONCILIATION_MS),
      limit,
    );
    let resolved = 0;

    for (const refund of pending) {
      try {
        if (!refund.providerRefundId) {
          const jobDispatcher = this.moduleRef.get(JobDispatcher, { strict: false });

          // No deduplication key: a retained failed job must not block this
          // recovery dispatch, and the fact's pending state plus the provider
          // idempotency key make duplicate enqueues safe.
          await jobDispatcher.dispatch(
            'order.process-refund',
            { orderId: refund.orderId },
          );
          continue;
        }

        const providerRefund = await this.paymentGateway.retrieveRefund(
          refund.providerRefundId,
        );

        if (await this.applyProviderRefund({
          providerRefundId: providerRefund.id,
          status: providerRefund.status,
          amountMinor: providerRefund.amount,
          failureReason: providerRefund.failureReason,
        })) {
          resolved += 1;
        }
      }
      catch (error) {
        this.logger.error(
          `Failed to reconcile pending refund ${refund.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return resolved;
  }

  /**
   * Records a refund the app never requested — issued in the provider's own
   * dashboard or by support — so the ledger matches the money that actually
   * left. The refund's Order is resolved from the payment intent; a shared
   * intent or an unknown one is an operator exception, never a guess.
   */
  private async settleExternalRefund(
    update: ProviderRefundUpdate,
  ): Promise<boolean> {
    const amountMinor = update.amountMinor ?? 0;

    if (!update.paymentIntentId || amountMinor <= 0) {
      this.logger.warn(
        `No Order Refund matches provider refund ${update.providerRefundId} and it names no attributable amount; ignoring its ${update.status} event`,
      );
      return false;
    }

    const order = await this.orderRefundRepository.findOrderByPaymentIntentId(
      update.paymentIntentId,
    );

    if (!order) {
      this.logger.warn(
        `Provider refund ${update.providerRefundId} for payment intent ${update.paymentIntentId} matches no single Order; ignoring its ${update.status} event`,
      );
      return false;
    }

    // The provider reports the amount it returned, in the charge currency the
    // Order was paid in; the fact is created already settled.
    const refund = await this.orderRefundRepository.createPending({
      orderId: order.id,
      currency: order.currency,
      amountMinor,
      requestedAt: new Date(),
    });

    this.logger.warn(
      `Provider refund ${update.providerRefundId} has no local request; recording it against order ${order.id}`,
    );

    return this.markRefundSucceeded(order.id, refund.id, {
      providerRefundId: update.providerRefundId,
      refundedAmountMinor: amountMinor,
    });
  }

  /**
   * Resolves the refund this run must execute. A pending refund fact is already
   * the request; a cancellation or status change that only projected a pending
   * refund gets its fact created here for the remaining refundable amount. An
   * Order that is not currently requesting a refund yields nothing, so a stale
   * job can never refund money nobody asked to return.
   */
  private async resolveRefundToProcess(
    order: OrderEntity,
  ): Promise<OrderRefundEntity | null> {
    return this.entityManager.transactional(async (entityManager) => {
      const lockedOrder = await this.orderRefundQueryRepository.findByIdForUpdate(
        order.id,
        { entityManager },
      );

      if (
        !lockedOrder
        || this.readString(lockedOrder.paymentDetails, 'refund_status') !== 'pending'
      ) {
        return null;
      }

      const pending = await this.orderRefundRepository.findPendingByOrderId(
        lockedOrder.id,
        { entityManager },
      );

      if (pending) {
        return pending;
      }

      const succeeded = await this.orderRefundRepository.sumAmountMinorByStatus(
        lockedOrder.id,
        [OrderRefundStatus.SUCCEEDED],
        { entityManager },
      );
      const remaining = lockedOrder.totalMinor - succeeded;

      if (remaining <= 0) {
        return null;
      }

      return this.orderRefundRepository.createPending({
        orderId: lockedOrder.id,
        currency: lockedOrder.currency,
        amountMinor: remaining,
        requestedAt: new Date(),
      }, { entityManager });
    });
  }

  private async markRefundSucceeded(
    orderId: string,
    refundId: string,
    input: { providerRefundId: string; refundedAmountMinor: number },
  ): Promise<boolean> {
    const completedAt = new Date();

    const changed = await this.entityManager.transactional(
      async (transactionalEntityManager) => {
        // Lock the Order before the refund row: every finalizer, including an
        // operator action that holds this lock first, takes them in this order.
        const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
          { id: orderId },
          { populate: ['shop'], lockMode: LockMode.PESSIMISTIC_WRITE },
        );

        if (!order) {
          return false;
        }

        const transitioned = await this.orderRefundRepository.markSucceeded(
          refundId,
          {
            providerRefundId: input.providerRefundId,
            refundedAmountMinor: input.refundedAmountMinor,
            completedAt,
          },
          { entityManager: transactionalEntityManager },
        );

        if (!transitioned) {
          return false;
        }

        const succeededTotal = await this.orderRefundRepository.sumAmountMinorByStatus(
          order.id,
          [OrderRefundStatus.SUCCEEDED],
          { entityManager: transactionalEntityManager },
        );
        const fullyRefunded = succeededTotal >= order.totalMinor;
        const previousStatus = order.status;

        order.paymentDetails = {
          ...order.paymentDetails,
          refund_status: 'succeeded' satisfies RefundStatus,
          refund_id: input.providerRefundId,
          refund_amount: fromMinorUnits(input.refundedAmountMinor, order.currency),
          refunded_total_amount: fromMinorUnits(succeededTotal, order.currency),
          refunded_at: completedAt.toISOString(),
          refund_failed_reason: undefined,
        };
        order.refundedAt = completedAt;

        if (fullyRefunded) {
          order.status = OrderStatus.REFUNDED;
        }

        await this.orderEventsService.record(transactionalEntityManager, {
          order,
          type: OrderEventType.REFUND_SUCCEEDED,
          actorType: OrderEventActorType.SYSTEM,
          source: 'refund_processor',
          occurredAt: completedAt,
          payload: {
            from_status: previousStatus,
            to_status: order.status,
            refund_id: input.providerRefundId,
            refund_amount: fromMinorUnits(input.refundedAmountMinor, order.currency),
            refund_amount_minor: input.refundedAmountMinor,
            full_refund: fullyRefunded,
          },
        });

        const refundEvent: OrderRefundEventInput = {
          refundId,
          orderId: order.id,
          orderPublicId: order.publicId,
          shopId: order.shop.id,
          currency: order.currency,
          refundedAmountMinor: input.refundedAmountMinor,
          occurredAt: completedAt,
        };

        const orderRefundedOutboxEvent =
          await this.orderRefundOutboxService.createOrderRefundedEvent(
            transactionalEntityManager,
            refundEvent,
          );

        // `inline` books the refund journal entry inside the producer's
        // transaction, so a booking failure rolls the refund state back and the
        // provider webhook (or the reconciliation sweep) retries it. The outbox
        // row is kept and marked processed as evidence, and the worker skips it.
        if (this.financeConfig.moneyEventBooking === 'inline') {
          await this.recordOrderRefundJournalEntryUseCase.recordWithin(
            transactionalEntityManager,
            buildOrderRefundEvent(refundEvent),
          );
          orderRefundedOutboxEvent.status = OutboxEventStatus.PROCESSED;
          orderRefundedOutboxEvent.processedAt = completedAt;
        }

        await transactionalEntityManager.flush();

        return true;
      },
    );

    if (changed) {
      await this.dispatchRefundNotification(orderId, 'succeeded');
    }

    return changed;
  }

  private async markRefundFailed(
    orderId: string,
    refundId: string,
    reason: string,
    providerRefundId?: string,
  ): Promise<boolean> {
    const completedAt = new Date();

    const changed = await this.entityManager.transactional(
      async (transactionalEntityManager) => {
        const order = await transactionalEntityManager
          .getRepository(OrderEntity)
          .findOne({ id: orderId }, { lockMode: LockMode.PESSIMISTIC_WRITE });

        if (!order) {
          return false;
        }

        const transitioned = await this.orderRefundRepository.markFailed(
          refundId,
          {
            failureReason: reason,
            completedAt,
            providerRefundId,
          },
          { entityManager: transactionalEntityManager },
        );

        if (!transitioned) {
          return false;
        }

        order.paymentDetails = {
          ...order.paymentDetails,
          refund_status: 'failed' satisfies RefundStatus,
          ...(providerRefundId ? { refund_id: providerRefundId } : {}),
          refund_failed_reason: reason,
        };

        await this.orderEventsService.record(transactionalEntityManager, {
          order,
          type: OrderEventType.REFUND_FAILED,
          actorType: OrderEventActorType.SYSTEM,
          source: 'refund_processor',
          occurredAt: completedAt,
          payload: {
            reason,
            refund_id: providerRefundId,
          },
        });

        await transactionalEntityManager.flush();

        return true;
      },
    );

    if (changed) {
      await this.dispatchRefundNotification(orderId, 'failed');
    }

    return changed;
  }

  private readString(
    source: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = source?.[key];

    return typeof value === 'string' ? value : undefined;
  }

  private async dispatchRefundNotification(
    orderId: string,
    refundStatus: 'succeeded' | 'failed',
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
      const order = await this.orderRefundQueryRepository.findByIdWithShopOwner(orderId);
      const sellerUserId = order
        ? getSellerOrderNotificationRecipientId(order)
        : null;

      if (order && sellerUserId && notifyUserUseCase) {
        await notifyUserUseCase.execute(
          buildSellerOrderRefundNotification(
            sellerUserId,
            order.publicId,
            getRequiredOrderNumber(order),
            order.shop.publicId,
            refundStatus,
          ),
        );
      }
    }
    catch (error) {
      this.logger.error(
        `Failed to schedule refund notification for order ${orderId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
