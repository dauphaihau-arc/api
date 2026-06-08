import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { UpdateAdminOrderStatusDto } from '../../../api/rest/dto/update-admin-order-status.dto';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderEventsService } from '../../order-events.service';
import { toAdminOrderDetail } from '../../admin-order-read-model';
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
  constructor(
    private readonly entityManager: EntityManager,
    private readonly eventEmitter: EventEmitter2,
    private readonly orderEventsService: OrderEventsService
  ) {}

  async execute(
    orderId: string,
    input: UpdateAdminOrderStatusDto
  ): Promise<AdminOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      buildOrderIdentifierWhere(orderId),
      { populate: ['shop', 'user'] }
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    if (!ALLOWED_ADMIN_STATUSES.has(input.status)) {
      throw new AdminOrderStatusOverrideNotAllowedError();
    }

    const previousStatus = order.status;

    if (input.status === OrderStatus.REFUNDED) {
      if ([OrderStatus.CHECKOUT_PENDING, OrderStatus.AWAITING_PAYMENT, OrderStatus.EXPIRED].includes(order.status)) {
        throw new AdminRefundNotAllowedError();
      }

      order.status = OrderStatus.REFUNDED;
      order.refundedAt = new Date();
    }

    if (input.status === OrderStatus.CANCELED) {
      order.status = OrderStatus.CANCELED;
      order.canceledAt = order.canceledAt ?? new Date();
      order.cancelReason = input.cancelReason?.trim() || order.cancelReason;
    }

    if (input.status === OrderStatus.ARCHIVED) {
      order.status = OrderStatus.ARCHIVED;
    }

    if (order.status !== previousStatus) {
      await this.orderEventsService.record(entityManager, {
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

    await entityManager.flush();

    if (order.user?.id) {
      this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
        userId: order.user.id,
        orderId: order.id,
        changed: ['status'],
        status: order.status,
        shippingStatus: order.shippingStatus,
      });
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['product', 'product.shop', 'inventory'] }
    );

    return toAdminOrderDetail(order, items);
  }
}
