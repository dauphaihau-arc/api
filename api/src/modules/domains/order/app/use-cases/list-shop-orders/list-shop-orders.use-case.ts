import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import type { ListShopOrdersQueryDto } from '../../../api/rest/dto/list-shop-orders.query.dto';
import { toShopOrderSummary } from '../../shop-order-read-model';
import type { ShopOrderListResult } from '../../order.types';

@Injectable()
export class ListShopOrdersUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    shopId: string,
    query: ListShopOrdersQueryDto
  ): Promise<ShopOrderListResult> {
    const entityManager = this.entityManager.fork();
    const where: Record<string, unknown> = { shop: shopId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.shippingStatus) {
      where.shippingStatus = query.shippingStatus;
    }

    const [orders, totalResults] = await entityManager.getRepository(OrderEntity).findAndCount(
      where,
      {
        populate: ['shop'],
        orderBy: { createdAt: 'desc' },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      }
    );

    const orderItems = orders.length > 0
      ? await entityManager.getRepository(OrderItemEntity).find(
        { order: { $in: orders.map((order) => order.id) } },
        { populate: ['order', 'product', 'product.shop', 'inventory'] }
      )
      : [];
    const itemsByOrderId = new Map<string, OrderItemEntity[]>();

    for (const item of orderItems) {
      const existing = itemsByOrderId.get(item.order.id) ?? [];
      existing.push(item);
      itemsByOrderId.set(item.order.id, existing);
    }

    return {
      results: orders.map((order) =>
        toShopOrderSummary(order, itemsByOrderId.get(order.id) ?? [])
      ),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
    };
  }
}
