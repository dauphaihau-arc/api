import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { UpdateShopOrderShipmentDto } from '../../../api/rest/dto/update-shop-order-shipment.dto';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import {
  InvalidShippingStatusTransitionError,
  OrderNotFoundError,
  ShipmentUpdateNotAllowedError,
  ShipmentUpdatePayloadRequiredError,
} from '../../errors/order-app.error';
import { toShopOrderDetail } from '../../shop-order-read-model';
import type { ShopOrderDetail } from '../../order.types';

const BLOCKED_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELED,
  OrderStatus.REFUNDED,
  OrderStatus.EXPIRED,
  OrderStatus.ARCHIVED,
  OrderStatus.CHECKOUT_PENDING,
  OrderStatus.AWAITING_PAYMENT,
]);

const ALLOWED_SHIPPING_TRANSITIONS: Record<OrderShippingStatus, OrderShippingStatus[]> = {
  [OrderShippingStatus.PRE_TRANSIT]: [
    OrderShippingStatus.IN_TRANSIT,
    OrderShippingStatus.SHIPPED,
  ],
  [OrderShippingStatus.IN_TRANSIT]: [
    OrderShippingStatus.SHIPPED,
    OrderShippingStatus.DELIVERED,
  ],
  [OrderShippingStatus.SHIPPED]: [OrderShippingStatus.DELIVERED],
  [OrderShippingStatus.DELIVERED]: [],
};

@Injectable()
export class UpdateShopOrderShipmentUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    shopId: string,
    orderId: string,
    input: UpdateShopOrderShipmentDto
  ): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: orderId, shop: shopId },
      { populate: ['shop'] }
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    if (
      input.shippingStatus === undefined
      && input.trackingNumber === undefined
      && input.shippingCarrier === undefined
      && input.shipmentNote === undefined
    ) {
      throw new ShipmentUpdatePayloadRequiredError();
    }

    if (BLOCKED_ORDER_STATUSES.has(order.status)) {
      throw new ShipmentUpdateNotAllowedError();
    }

    if (input.shippingStatus) {
      const allowedTransitions = ALLOWED_SHIPPING_TRANSITIONS[order.shippingStatus];

      if (
        input.shippingStatus !== order.shippingStatus
        && !allowedTransitions.includes(input.shippingStatus)
      ) {
        throw new InvalidShippingStatusTransitionError();
      }

      order.shippingStatus = input.shippingStatus;

      if (
        [OrderShippingStatus.SHIPPED, OrderShippingStatus.DELIVERED].includes(input.shippingStatus)
        && !order.shippedAt
      ) {
        order.shippedAt = new Date();
      }

      if (input.shippingStatus === OrderShippingStatus.DELIVERED) {
        order.deliveredAt = new Date();

        if (order.status === OrderStatus.PAID) {
          order.status = OrderStatus.COMPLETED;
        }
      }
    }

    if (input.trackingNumber !== undefined) {
      order.trackingNumber = input.trackingNumber.trim() || undefined;
    }

    if (input.shippingCarrier !== undefined) {
      order.shippingCarrier = input.shippingCarrier.trim() || undefined;
    }

    if (input.shipmentNote !== undefined) {
      order.shipmentNote = input.shipmentNote.trim() || undefined;
    }

    await entityManager.flush();

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['order', 'product', 'product.shop', 'inventory'] }
    );

    return toShopOrderDetail(order, items);
  }
}
