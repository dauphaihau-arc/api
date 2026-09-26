import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { NotifyUserUseCase } from '~/domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { OrderFulfillmentViewPort } from '../../fulfillment/app/ports/order-fulfillment-view.port';
import {
  ORDER_FULFILLMENT_UPDATED_EVENT,
  type OrderFulfillmentUpdatedEventPayload,
} from '../../fulfillment/app/events/order-fulfillment-updated.event';
import { OrderEventActorType } from '../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../domain/enums/order-event-type.enum';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import { dispatchBestSellerRankingRefresh } from '../app/best-seller-ranking-refresh';
import { ORDER_UPDATED_SSE_EVENT } from '../app/events/order-sse.event';
import { buildOrderFulfillmentSummary, canceledFulfillmentOrderIds } from '../app/order-fulfillment';
import { getRequiredOrderNumber } from '../app/order-number';
import { OrderEventsService } from '../app/services/order-events.service';

/**
 * Projects the fulfillment collection onto the Order: keeps the list/filter
 * aggregate fresh, applies the existing eligible-paid-order completion policy
 * once every ordered quantity is delivered, and notifies the buyer.
 */
@Injectable()
export class ApplyOrderFulfillmentListener {
  private readonly logger = new Logger(ApplyOrderFulfillmentListener.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderEventsService: OrderEventsService,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2,
    private readonly jobDispatcher: JobDispatcher,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

  @OnEvent(ORDER_FULFILLMENT_UPDATED_EVENT, { suppressErrors: true })
  async handle(payload: OrderFulfillmentUpdatedEventPayload): Promise<void> {
    const outcome = await this.entityManager.transactional(async (entityManager) => {
      const order = await entityManager.getRepository(OrderEntity).findOne(
        { id: payload.orderId },
        { populate: ['shop'] },
      );

      if (!order) {
        return null;
      }

      const view = (await this.orderFulfillmentViewPort.load(entityManager, [order.id], {
        canceledOrderIds: canceledFulfillmentOrderIds([order]),
      })).get(order.id);
      const summary = buildOrderFulfillmentSummary(order, view);
      const previousStatus = order.status;
      order.fulfillmentStatus = summary.status;

      let completed = false;

      if (
        order.status === OrderStatus.PAID
        && summary.progress.ordered > 0
        && summary.progress.delivered >= summary.progress.ordered
      ) {
        order.status = OrderStatus.COMPLETED;
        completed = true;

        await this.orderEventsService.record(entityManager, {
          order,
          type: OrderEventType.ORDER_STATUS_CHANGED,
          actorType: OrderEventActorType.SYSTEM,
          source: 'fulfillment',
          payload: {
            from: previousStatus,
            to: order.status,
          },
        });
      }

      await entityManager.flush();

      return {
        completed,
        customerUserId: payload.customerUserId,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        status: order.status,
        fulfillmentStatus: summary.status,
      };
    });

    if (!outcome) {
      return;
    }

    if (outcome.completed) {
      try {
        await dispatchBestSellerRankingRefresh(this.jobDispatcher);
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule best-seller ranking refresh for completed order ${payload.orderId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (!outcome.customerUserId) {
      return;
    }

    this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
      userId: outcome.customerUserId,
      orderId: payload.orderId,
      changed: outcome.completed ? ['status', 'fulfillment'] : ['fulfillment'],
      status: outcome.status,
      fulfillmentStatus: outcome.fulfillmentStatus,
    });

    await this.notifyUserUseCase.execute({
      userId: outcome.customerUserId,
      type: 'order.fulfillment.updated',
      title: 'Order fulfillment updated',
      body: `Fulfillment for order ${outcome.orderNumber} is now ${outcome.fulfillmentStatus.replace(/_/g, ' ')}.`,
      data: {
        orderId: payload.orderId,
        shopId: outcome.shopId,
        fulfillmentStatus: outcome.fulfillmentStatus,
      },
      channels: ['in_app', 'web_push'],
    });
  }
}
