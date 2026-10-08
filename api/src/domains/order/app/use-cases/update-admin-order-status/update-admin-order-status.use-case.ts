import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import {
  PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
  type ProductInventoryUpdatedSseEventPayload,
} from '~/domains/product/app/events/product-inventory-sse.event';
import { dispatchCatalogProductProjections } from '~/domains/product/app/catalog-product-projection-dispatch';
import { FulfillmentService } from '~/domains/fulfillment/app/services/fulfillment.service';
import type { UpdateAdminOrderStatusDto } from '../../../api/rest/dto/update-admin-order-status.dto';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { dispatchBestSellerRankingRefresh } from '../../best-seller-ranking-refresh';
import { OrderCancellationService } from '../../services/order-cancellation.service';
import { OrderEventsService } from '../../services/order-events.service';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import { toAdminOrderDetail } from '../../admin-order-read-model';
import { canceledFulfillmentOrderIds } from '../../order-fulfillment';
import { buildOrderIdentifierWhere } from '../../order-identifier';
import {
  AdminOrderStatusOverrideNotAllowedError,
  AdminRefundNotAllowedError,
  OrderNotFoundError,
} from '../../errors/order-app.error';
import { ORDER_UPDATED_SSE_EVENT } from '../../events/order-sse.event';
import type { AdminOrderDetail } from '../../order.types';

const ALLOWED_ADMIN_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELED,
  OrderStatus.REFUNDED,
  OrderStatus.ARCHIVED,
]);

@Injectable()
export class UpdateAdminOrderStatusUseCase {
  private readonly logger = new Logger(UpdateAdminOrderStatusUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly eventEmitter: EventEmitter2,
    private readonly jobDispatcher: JobDispatcher,
    private readonly orderEventsService: OrderEventsService,
    private readonly orderCancellationService: OrderCancellationService,
    private readonly fulfillmentService: FulfillmentService,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

  async execute(
    orderId: string,
    input: UpdateAdminOrderStatusDto,
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

      if (!ALLOWED_ADMIN_STATUSES.has(input.status)) {
        throw new AdminOrderStatusOverrideNotAllowedError();
      }

      const previousStatus = order.status;
      let inventoryEvents: Array<ProductInventoryUpdatedSseEventPayload> = [];

      if (input.status === OrderStatus.REFUNDED) {
        if ([OrderStatus.CHECKOUT_PENDING, OrderStatus.AWAITING_PAYMENT, OrderStatus.EXPIRED].includes(order.status)) {
          throw new AdminRefundNotAllowedError();
        }

        order.status = OrderStatus.REFUNDED;
        order.refundedAt = new Date();
      }

      if (input.status === OrderStatus.CANCELED) {
        if (order.status === OrderStatus.CANCELED) {
          order.cancelReason = input.cancelReason?.trim() || order.cancelReason;
        }
        else {
          // Admin cancellation uses the same authoritative dispatch state as the
          // buyer and seller paths: once any quantity is handed to a carrier the
          // whole-order cancellation must not cancel only the remainder.
          const dispatchState = await this.fulfillmentService.getDispatchState(
            transactionalEntityManager,
            order.id,
          );
          const legacyDispatched = !dispatchState.hasGroups
            && order.shippingStatus !== OrderShippingStatus.PRE_TRANSIT;

          if (dispatchState.hasDispatched || legacyDispatched) {
            throw new AdminOrderStatusOverrideNotAllowedError();
          }

          const cancellation = await this.orderCancellationService.cancelOrder(
            transactionalEntityManager,
            order,
            {
              canceledAt: new Date(),
              cancelReason: input.cancelReason,
              source: 'admin',
              // Admin status override keeps its original policy: it does not
              // request a refund automatically.
              requestRefund: false,
            },
          );
          inventoryEvents = cancellation.inventoryEvents;
        }
      }

      if (input.status === OrderStatus.ARCHIVED) {
        order.status = OrderStatus.ARCHIVED;
      }

      if (order.status !== previousStatus) {
        await this.orderEventsService.record(transactionalEntityManager, {
          order,
          type: OrderEventType.ORDER_STATUS_CHANGED,
          actorType: OrderEventActorType.ADMIN,
          source: 'admin_order_status',
          payload: {
            from: previousStatus,
            to: order.status,
            reason: input.cancelReason,
          },
        });
      }

      await transactionalEntityManager.flush();

      const items = await transactionalEntityManager.getRepository(OrderItemEntity).find(
        { order: order.id },
        { populate: ['product', 'product.shop', 'inventory'] },
      );
      const fulfillmentView = (await this.orderFulfillmentViewPort.load(
        transactionalEntityManager,
        [order.id],
        { canceledOrderIds: canceledFulfillmentOrderIds([order]) },
      )).get(order.id);

      return {
        detail: toAdminOrderDetail(order, items, fulfillmentView),
        customerUserId: order.user?.id,
        previousStatus,
        status: order.status,
        inventoryEvents,
      };
    });

    for (const inventoryEvent of result.inventoryEvents) {
      this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
    }

    try {
      await dispatchCatalogProductProjections(
        this.jobDispatcher,
        result.inventoryEvents.map((event) => event.productId),
      );
    }
    catch (error) {
      // Catalog projection is a derived read model: a failed enqueue must not fail
      // the committed cancellation, which would invite a confusing retry.
      this.logger.error(
        `Failed to schedule catalog projections for admin order ${result.detail.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    if (result.customerUserId) {
      this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
        userId: result.customerUserId,
        orderId: result.detail.publicId,
        changed: result.status === OrderStatus.CANCELED
          ? ['status', 'fulfillment']
          : ['status'],
        status: result.status,
      });
    }

    if (result.status !== result.previousStatus) {
      try {
        await dispatchBestSellerRankingRefresh(this.jobDispatcher);
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule best-seller ranking refresh for admin order ${result.detail.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return result.detail;
  }
}
