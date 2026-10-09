import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';
import { computeAggregateStatus } from '../../domain/fulfillment-progress';
import { FulfillmentAggregateStatus } from '../../domain/enums/fulfillment-aggregate-status.enum';
import { emptyFulfillmentOrderView } from '../fulfillment-view.factory';
import {
  ORDER_FULFILLMENT_UPDATED_EVENT,
  type OrderFulfillmentUpdatedEventPayload,
} from '../events/order-fulfillment-updated.event';
import { OrderNotEligibleForFulfillmentError } from '../errors/fulfillment-app.error';
import { FulfillmentOrderNotFoundError } from '../errors/fulfillment-app.error';
import {
  OrderFulfillmentContextPort,
  type OrderFulfillmentContext,
  type OrderLegacyShippingEvidence,
} from '../ports/order-fulfillment-context.port';
import type { FulfillmentOrderView } from '../fulfillment.types';
import { FulfillmentService } from './fulfillment.service';

const BLOCKED_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELED,
  OrderStatus.REFUNDED,
  OrderStatus.EXPIRED,
  OrderStatus.ARCHIVED,
  OrderStatus.CHECKOUT_PENDING,
  OrderStatus.AWAITING_PAYMENT,
]);

export const RECONCILABLE_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.PENDING,
  OrderStatus.PAID,
]);

/**
 * The authoritative fulfillment view a fulfillment command produced, with the
 * aggregate status and reconciliation state the transport layer serializes.
 */
export type FulfillmentCommandResult = {
  view: FulfillmentOrderView;
  status: FulfillmentAggregateStatus;
  requiresReconciliation: boolean;
  legacyShipping: OrderLegacyShippingEvidence;
};

export type FulfillmentCommand = (
  context: OrderFulfillmentContext,
  entityManager: EntityManager,
) => Promise<void>;

/**
 * Shared shell for shop-scoped fulfillment commands: loads the order context,
 * enforces the common eligibility policy, runs the command in one transaction,
 * publishes the domain event, and returns the authoritative fulfillment view.
 */
@Injectable()
export class FulfillmentCommandRunner {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderFulfillmentContextPort: OrderFulfillmentContextPort,
    private readonly fulfillmentService: FulfillmentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    command: FulfillmentCommand,
  ): Promise<FulfillmentCommandResult> {
    const context = await this.orderFulfillmentContextPort.findForFulfillment(
      shopId,
      orderId,
    );

    if (!context) {
      throw new FulfillmentOrderNotFoundError();
    }

    if (BLOCKED_ORDER_STATUSES.has(context.status as OrderStatus)) {
      throw new OrderNotEligibleForFulfillmentError();
    }

    const entityManager = this.entityManager.fork();

    await entityManager.transactional(async (transactionalEntityManager) => {
      // Lock the Order row before the group rows so a concurrent cancellation and
      // a preparation serialize: whichever commits first, the other sees the
      // authoritative status rather than stale client state.
      const lockedContext = await this.orderFulfillmentContextPort.findForFulfillment(
        shopId,
        orderId,
        { entityManager: transactionalEntityManager, lock: true },
      );

      if (!lockedContext) {
        throw new FulfillmentOrderNotFoundError();
      }

      if (BLOCKED_ORDER_STATUSES.has(lockedContext.status as OrderStatus)) {
        throw new OrderNotEligibleForFulfillmentError();
      }

      await command(lockedContext, transactionalEntityManager);
    });

    this.eventEmitter.emit(ORDER_FULFILLMENT_UPDATED_EVENT, {
      orderId: context.id,
      shopId: context.shopId,
      customerUserId: context.customerUserId,
    } satisfies OrderFulfillmentUpdatedEventPayload);

    const isCanceled = context.status === OrderStatus.CANCELED;
    const view = (await this.fulfillmentService.loadOrderFulfillment(
      entityManager,
      [context.id],
      { canceledOrderIds: isCanceled ? [context.id] : [] },
    )).get(context.id) ?? emptyFulfillmentOrderView();

    const hasGroups = view.groups.length > 0;

    return {
      view,
      status: hasGroups || isCanceled
        ? computeAggregateStatus({
          orderedQuantity: view.progress.ordered,
          progress: view.progress,
          hasGroups,
          isCanceled,
        })
        : context.fulfillmentStatus as FulfillmentAggregateStatus,
      requiresReconciliation: !hasGroups
        && RECONCILABLE_ORDER_STATUSES.has(context.status as OrderStatus),
      legacyShipping: context.legacyShipping,
    };
  }
}
