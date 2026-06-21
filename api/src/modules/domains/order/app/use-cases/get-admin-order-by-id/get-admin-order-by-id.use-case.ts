import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { toAdminOrderDetail } from '../../admin-order-read-model';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { buildOrderIdentifierWhere } from '../../order-identifier';
import type { AdminOrderDetail } from '../../order.types';

@Injectable()
export class GetAdminOrderByIdUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(orderId: string): Promise<AdminOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      buildOrderIdentifierWhere(orderId),
      { populate: ['shop'] },
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['product', 'product.shop', 'inventory'] },
    );

    return toAdminOrderDetail(order, items);
  }
}
