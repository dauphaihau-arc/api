import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { buildScopedOrderIdentifierWhere } from '../../order-identifier';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import { buildShopOrderDetail } from '../../shop-order-detail.loader';
import type { ShopOrderDetail } from '../../order.types';

@Injectable()
export class GetShopOrderByIdUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

  async execute(shopId: string, orderId: string): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      buildScopedOrderIdentifierWhere(orderId, { shop: shopId }),
      { populate: ['shop'] },
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    return buildShopOrderDetail(entityManager, order, this.orderFulfillmentViewPort);
  }
}
