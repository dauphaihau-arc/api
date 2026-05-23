import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { toShopOrderDetail } from '../../shop-order-read-model';
import type { ShopOrderDetail } from '../../order.types';

@Injectable()
export class GetShopOrderByIdUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(shopId: string, orderId: string): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: orderId, shop: shopId },
      { populate: ['shop'] }
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['order', 'product', 'product.shop', 'inventory'] }
    );

    return toShopOrderDetail(order, items);
  }
}
