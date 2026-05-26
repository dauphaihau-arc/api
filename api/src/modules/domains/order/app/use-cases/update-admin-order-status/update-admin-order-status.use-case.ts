import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SSE_ORDER_UPDATED_EVENT } from '~/modules/shared/sse/app/sse.events';
import type { UpdateAdminOrderStatusDto } from '../../../api/rest/dto/update-admin-order-status.dto';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { toAdminOrderDetail } from '../../admin-order-read-model';
import {
  AdminOrderStatusOverrideNotAllowedError,
  AdminRefundNotAllowedError,
  OrderNotFoundError,
} from '../../errors/order-app.error';
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
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    orderId: string,
    input: UpdateAdminOrderStatusDto
  ): Promise<AdminOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: orderId },
      { populate: ['shop', 'user'] }
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    if (!ALLOWED_ADMIN_STATUSES.has(input.status)) {
      throw new AdminOrderStatusOverrideNotAllowedError();
    }

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

    await entityManager.flush();

    if (order.user?.id) {
      this.eventEmitter.emit(SSE_ORDER_UPDATED_EVENT, {
        userId: order.user.id,
        orderId,
        changed: ['status'],
        status: order.status,
        shippingStatus: order.shippingStatus,
      });
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['order', 'product', 'product.shop', 'inventory'] }
    );

    return toAdminOrderDetail(order, items);
  }
}
