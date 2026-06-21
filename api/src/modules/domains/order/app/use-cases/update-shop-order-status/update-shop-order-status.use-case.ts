import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PRODUCT_INVENTORY_UPDATED_SSE_EVENT } from '~/modules/domains/product/app/events/product-inventory-sse.event';
import { NotifyUserUseCase } from '~/modules/shared/notification/app/use-cases/notify-user/notify-user.use-case';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import type { UpdateShopOrderStatusDto } from '../../../api/rest/dto/update-shop-order-status.dto';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import {
  OrderNotFoundError,
  SellerOrderCancelNotAllowedError,
  SellerOrderStatusUpdateNotAllowedError,
  SellerShippedOrderCancelNotAllowedError,
} from '../../errors/order-app.error';
import { ORDER_UPDATED_SSE_EVENT } from '../../events/order-sse.event';
import { buildScopedOrderIdentifierWhere } from '../../order-identifier';
import { OrderCancellationService } from '../../order-cancellation.service';
import { OrderEventsService } from '../../order-events.service';
import { buildShopOrderDetail } from '../../shop-order-detail.loader';
import type { ShopOrderDetail } from '../../order.types';

@Injectable()
export class UpdateShopOrderStatusUseCase {
  private readonly logger = new Logger(UpdateShopOrderStatusUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderCancellationService: OrderCancellationService,
    private readonly jobDispatcher: JobDispatcher,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2,
    private readonly orderEventsService: OrderEventsService,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    input: UpdateShopOrderStatusDto,
  ): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();

    const result = await entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        buildScopedOrderIdentifierWhere(orderId, { shop: shopId }),
        { populate: ['shop', 'user'] },
      );

      if (!order) {
        throw new OrderNotFoundError();
      }

      if (input.status !== OrderStatus.CANCELED) {
        throw new SellerOrderStatusUpdateNotAllowedError();
      }

      if (order.status === OrderStatus.CANCELED) {
        return {
          refundRequested: false,
          inventoryEvents: [],
          detail: await this.buildDetail(transactionalEntityManager, order),
        };
      }

      if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) {
        throw new SellerOrderCancelNotAllowedError();
      }

      if (order.shippingStatus !== OrderShippingStatus.PRE_TRANSIT) {
        throw new SellerShippedOrderCancelNotAllowedError();
      }

      const previousStatus = order.status;
      const { refundRequested, inventoryEvents } = await this.orderCancellationService.cancelOrder(transactionalEntityManager, order, {
        canceledAt: new Date(),
        cancelReason: input.cancelReason,
        source: 'seller',
      });

      await this.orderEventsService.record(transactionalEntityManager, {
        order,
        type: OrderEventType.ORDER_STATUS_CHANGED,
        actorType: OrderEventActorType.SELLER,
        source: 'shop_order_status',
        payload: {
          from: previousStatus,
          to: order.status,
          reason: input.cancelReason,
        },
      });

      await transactionalEntityManager.flush();

      return {
        refundRequested,
        inventoryEvents,
        customerUserId: order.user?.id,
        detail: await this.buildDetail(transactionalEntityManager, order),
      };
    });

    for (const inventoryEvent of result.inventoryEvents) {
      this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
    }

    if (result.refundRequested) {
      try {
        await this.jobDispatcher.dispatch('order.process-refund', { orderId: result.detail.id });
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule refund for canceled shop order ${result.detail.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (result.customerUserId) {
      this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
        userId: result.customerUserId,
        orderId: result.detail.id,
        changed: ['status'],
        status: OrderStatus.CANCELED,
      });

      await this.notifyUserUseCase.execute({
        userId: result.customerUserId,
        type: 'order.canceled',
        title: 'Order canceled',
        body: `Your order ${result.detail.orderNumber} was canceled by the seller.`,
        data: {
          orderId: result.detail.id,
          shopId,
          actor: 'seller',
          status: OrderStatus.CANCELED,
        },
        channels: ['in_app', 'web_push'],
      });
    }

    return result.detail;
  }

  private async buildDetail(
    entityManager: EntityManager,
    order: OrderEntity,
  ): Promise<ShopOrderDetail> {
    return buildShopOrderDetail(entityManager, order);
  }
}
