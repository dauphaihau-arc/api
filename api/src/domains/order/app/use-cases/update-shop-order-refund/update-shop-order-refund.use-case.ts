import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { UpdateShopOrderRefundDto } from '../../../api/rest/dto/update-shop-order-refund.dto';
import { ShopOrderRefundAction } from '../../../api/rest/dto/update-shop-order-refund.dto';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { ORDER_UPDATED_SSE_EVENT } from '../../events/order-sse.event';
import {
  OrderNotFoundError,
  SellerRefundActionNotAllowedError,
  SellerRefundNotAllowedError,
  SellerRefundRequiresCardPaymentError,
} from '../../errors/order-app.error';
import { OrderEventsService } from '../../services/order-events.service';
import { OrderRefundRepository } from '../../ports/order-refund.repository';
import { OrderRefundStatus } from '../../../domain/enums/order-refund-status.enum';
import { buildScopedOrderIdentifierWhere } from '../../order-identifier';
import { FulfillmentService } from '../../../../fulfillment/app/services/fulfillment.service';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import { buildShopOrderDetail } from '../../shop-order-detail.loader';
import type { ShopOrderDetail } from '../../order.types';

type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'not_required';

@Injectable()
export class UpdateShopOrderRefundUseCase {
  private readonly logger = new Logger(UpdateShopOrderRefundUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
    private readonly eventEmitter: EventEmitter2,
    private readonly orderEventsService: OrderEventsService,
    private readonly orderRefundRepository: OrderRefundRepository,
    private readonly fulfillmentService: FulfillmentService,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    input: UpdateShopOrderRefundDto,
  ): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();

    const result = await entityManager.transactional(async (transactionalEntityManager) => {

      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        buildScopedOrderIdentifierWhere(orderId, { shop: shopId }),
        { populate: ['shop', 'user'], lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!order) {
        throw new OrderNotFoundError();
      }

      if (order.paymentType !== PaymentType.CARD) {
        throw new SellerRefundRequiresCardPaymentError();
      }

      const refundStatus = this.getRefundStatus(order.paymentDetails);

      const [succeededAmountMinor, pendingAmountMinor] = await Promise.all([
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

      const dispatchState = await this.fulfillmentService.getDispatchState(
        transactionalEntityManager,
        order.id,
      );

      const legacyDispatched = !dispatchState.hasGroups
        && order.shippingStatus !== OrderShippingStatus.PRE_TRANSIT;

      this.assertRefundActionAllowed(
        order.status,
        dispatchState.hasDispatched || legacyDispatched,
        refundStatus,
        input.action,
      );

      // A seller refund always returns the whole remaining amount: what the
      // buyer paid less anything already returned or already committed.
      const amountMinor = order.totalMinor - succeededAmountMinor - pendingAmountMinor;

      if (amountMinor <= 0) {
        throw new SellerRefundActionNotAllowedError();
      }

      const now = new Date();

      await this.orderRefundRepository.createPending(
        {
          orderId: order.id,
          currency: order.currency,
          amountMinor,
          requestedAt: now,
        },
        { entityManager: transactionalEntityManager },
      );

      order.refundedAt = undefined;
      order.paymentDetails = {
        ...order.paymentDetails,
        refund_status: 'pending' satisfies RefundStatus,
        refund_requested_at: now.toISOString(),
        refund_failed_reason: undefined,
        refunded_at: undefined,
        refund_note: undefined,
      };

      await this.orderEventsService.record(transactionalEntityManager, {
        order,
        type: OrderEventType.REFUND_REQUESTED,
        actorType: OrderEventActorType.SELLER,
        source: 'shop_order_refund',
        occurredAt: now,
        payload: {
          action: input.action,
          status: order.status,
          amount_minor: amountMinor,
          currency: order.currency,
        },
      });

      await transactionalEntityManager.flush();

      return {
        customerUserId: order.user?.id,
        detail: await buildShopOrderDetail(transactionalEntityManager, order, this.orderFulfillmentViewPort),
      };
    });

    if (result.customerUserId) {
      this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
        userId: result.customerUserId,
        orderId: result.detail.publicId,
        changed: ['refundStatus'],
        status: result.detail.status,
      });
    }

    try {
      await this.jobDispatcher.dispatch(
        'order.process-refund',
        { orderId: result.detail.id },
        { deduplicationKey: appJobDeduplicationKey.processOrderRefund(result.detail.id) },
      );
    }
    catch (error) {
      this.logger.error(
        `Failed to schedule seller refund for shop order ${result.detail.id}`,
        error instanceof Error ? error.stack : undefined,
      );
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
    hasDispatchedQuantities: boolean,
    refundStatus: RefundStatus | undefined,
    action: ShopOrderRefundAction,
  ): void {
    if ([OrderStatus.CHECKOUT_PENDING, OrderStatus.AWAITING_PAYMENT, OrderStatus.EXPIRED, OrderStatus.ARCHIVED].includes(orderStatus)) {
      throw new SellerRefundNotAllowedError();
    }

    // Any refund already in flight, finished, or waived blocks a new request:
    // a refund returns the whole remaining amount, so a succeeded one means
    // nothing is left to return.
    if (
      refundStatus === 'pending'
      || refundStatus === 'succeeded'
      || refundStatus === 'not_required'
    ) {
      throw new SellerRefundActionNotAllowedError();
    }

    if (action === ShopOrderRefundAction.RETRY) {
      if (
        refundStatus !== 'failed'
        || ![OrderStatus.CANCELED, OrderStatus.PAID, OrderStatus.COMPLETED].includes(orderStatus)
      ) {
        throw new SellerRefundActionNotAllowedError();
      }

      return;
    }

    if (orderStatus === OrderStatus.PAID) {
      if (!hasDispatchedQuantities) {
        throw new SellerRefundNotAllowedError();
      }

      return;
    }

    if (orderStatus !== OrderStatus.COMPLETED) {
      throw new SellerRefundActionNotAllowedError();
    }
  }
}
