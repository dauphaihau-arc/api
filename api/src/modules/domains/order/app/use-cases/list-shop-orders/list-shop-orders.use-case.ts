import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { fromMinorUnits } from '~/common/utils/money';
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
    const where: FilterQuery<OrderEntity> = { shop: shopId };
    const andConditions: FilterQuery<OrderEntity>[] = [];

    if (query.status?.length) {
      where.status = { $in: query.status };
    }

    if (query.shippingStatus?.length) {
      where.shippingStatus = { $in: query.shippingStatus };
    }

    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { $gte: query.createdFrom } : {}),
        ...(query.createdTo ? { $lte: query.createdTo } : {}),
      };
    }

    if (query.amountMin !== undefined || query.amountMax !== undefined) {
      const amountMinorFilter = {
        ...(query.amountMin !== undefined ? { $gte: query.amountMin } : {}),
        ...(query.amountMax !== undefined ? { $lte: query.amountMax } : {}),
      };

      const amountCurrency = query.currency?.length === 1 ? query.currency[0] : undefined;

      if (amountCurrency) {
        andConditions.push({
          $or: [
            { totalMinor: amountMinorFilter },
            {
              totalMinor: null,
              total: {
                ...(query.amountMin !== undefined
                  ? { $gte: fromMinorUnits(query.amountMin, amountCurrency) }
                  : {}),
                ...(query.amountMax !== undefined
                  ? { $lte: fromMinorUnits(query.amountMax, amountCurrency) }
                  : {}),
              },
            },
          ],
        });
      }
      else {
        where.totalMinor = amountMinorFilter;
      }
    }

    if (query.currency?.length) {
      where.currency = { $in: query.currency };
    }

    if (query.paymentType?.length) {
      where.paymentType = { $in: query.paymentType };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      andConditions.push({
        $or: [
          { customerEmail: { $ilike: `%${search}%` } },
          { orderNumber: { $ilike: `%${search}%` } },
          { id: search },
        ],
      });
    }

    const resolvedWhere = andConditions.length > 0
      ? { ...where, $and: andConditions }
      : where;

    const [orders, totalResults] = await entityManager.getRepository(OrderEntity).findAndCount(
      resolvedWhere,
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
        { populate: ['product', 'product.shop', 'inventory'] }
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
