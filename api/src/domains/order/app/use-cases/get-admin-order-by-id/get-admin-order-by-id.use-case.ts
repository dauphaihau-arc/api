import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import { toAdminOrderDetail } from '../../admin-order-read-model';
import { canceledFulfillmentOrderIds } from '../../order-fulfillment';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { buildOrderIdentifierWhere } from '../../order-identifier';
import type { AdminOrderDetail } from '../../order.types';

@Injectable()
export class GetAdminOrderByIdUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

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

    const fulfillmentView = (await this.orderFulfillmentViewPort.load(entityManager, [order.id], {
      canceledOrderIds: canceledFulfillmentOrderIds([order]),
    })).get(order.id);

    return toAdminOrderDetail(order, items, fulfillmentView);
  }
}
