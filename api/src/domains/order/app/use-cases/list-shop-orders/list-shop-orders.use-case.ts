import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import type { ListShopOrdersQueryDto } from '../../../api/rest/dto/list-shop-orders.query.dto';
import { toShopOrderSummary } from '../../shop-order-read-model';
import type { ShopOrderListResult } from '../../order.types';
import { buildShopOrderWhere, mergeShopOrderWhere } from './shop-order-query-filter';

const SELLER_STATUS_COUNTS = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.REFUNDED,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELED,
  OrderStatus.EXPIRED,
  OrderStatus.ARCHIVED,
] as const;

@Injectable()
export class ListShopOrdersUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    shopId: string,
    query: ListShopOrdersQueryDto,
  ): Promise<ShopOrderListResult> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(OrderEntity);
    const baseWhere = buildShopOrderWhere(shopId, query);

    const resolvedWhere = query.status?.length
      ? mergeShopOrderWhere(baseWhere, { status: { $in: query.status } })
      : baseWhere;

    const [orders, totalResults, allCount, ...statusCountValues] = await Promise.all([
      repository.findAndCount(
        resolvedWhere,
        {
          populate: ['shop'],
          orderBy: { createdAt: 'desc' },
          offset: (query.page - 1) * query.limit,
          limit: query.limit,
        },
      ),
      repository.count(baseWhere),
      ...SELLER_STATUS_COUNTS.map(status =>
        repository.count(mergeShopOrderWhere(baseWhere, { status })),
      ),
    ]).then(([listResult, totalBaseCount, ...counts]) => [listResult[0], listResult[1], totalBaseCount, ...counts] as const);

    const orderItems = orders.length > 0
      ? await entityManager.getRepository(OrderItemEntity).find(
        { order: { $in: orders.map((order) => order.id) } },
        { populate: ['product', 'product.shop', 'inventory'] },
      )
      : [];
    const itemsByOrderId = new Map<string, OrderItemEntity[]>();

    for (const item of orderItems) {
      const existing = itemsByOrderId.get(item.order.id) ?? [];
      existing.push(item);
      itemsByOrderId.set(item.order.id, existing);
    }

    const statusCounts = SELLER_STATUS_COUNTS.reduce<ShopOrderListResult['statusCounts']>((accumulator, status, index) => {
      accumulator[status] = statusCountValues[index] ?? 0;
      return accumulator;
    }, {
      all: allCount,
      awaiting_payment: 0,
      pending: 0,
      paid: 0,
      refunded: 0,
      completed: 0,
      canceled: 0,
      expired: 0,
      archived: 0,
    });

    return {
      results: orders.map((order) =>
        toShopOrderSummary(order, itemsByOrderId.get(order.id) ?? []),
      ),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
      statusCounts,
    };
  }

}
