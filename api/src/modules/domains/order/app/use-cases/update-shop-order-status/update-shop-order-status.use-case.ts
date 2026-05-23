import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { UpdateShopOrderStatusDto } from '../../../api/rest/dto/update-shop-order-status.dto';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import {
  OrderNotFoundError,
  SellerOrderCancelNotAllowedError,
  SellerOrderStatusUpdateNotAllowedError,
  SellerShippedOrderCancelNotAllowedError,
} from '../../errors/order-app.error';
import { toShopOrderDetail } from '../../shop-order-read-model';
import type { ShopOrderDetail } from '../../order.types';

@Injectable()
export class UpdateShopOrderStatusUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    shopId: string,
    orderId: string,
    input: UpdateShopOrderStatusDto
  ): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: orderId, shop: shopId },
      { populate: ['shop'] }
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    if (input.status !== OrderStatus.CANCELED) {
      throw new SellerOrderStatusUpdateNotAllowedError();
    }

    if (order.status === OrderStatus.CANCELED) {
      return this.buildDetail(entityManager, order);
    }

    if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) {
      throw new SellerOrderCancelNotAllowedError();
    }

    if (order.shippingStatus !== OrderShippingStatus.PRE_TRANSIT) {
      throw new SellerShippedOrderCancelNotAllowedError();
    }

    order.status = OrderStatus.CANCELED;
    order.canceledAt = new Date();
    order.cancelReason = input.cancelReason?.trim() || order.cancelReason;

    await entityManager.flush();

    return this.buildDetail(entityManager, order);
  }

  private async buildDetail(
    entityManager: EntityManager,
    order: OrderEntity
  ): Promise<ShopOrderDetail> {
    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['order', 'product', 'product.shop', 'inventory'] }
    );

    return toShopOrderDetail(order, items);
  }
}
