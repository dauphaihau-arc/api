import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { buildScopedOrderIdentifierWhere } from '../../order-identifier';
import { toShopOrderDetail } from '../../shop-order-read-model';
import type { ShopOrderDetail } from '../../order.types';

@Injectable()
export class GetShopOrderByIdUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(shopId: string, orderId: string): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      buildScopedOrderIdentifierWhere(orderId, { shop: shopId }),
      { populate: ['shop'] }
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['product', 'product.shop', 'product.images', 'product.images.variants', 'inventory'] }
    );

    return toShopOrderDetail(order, items);
  }
}
