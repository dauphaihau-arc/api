import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { fromMinorUnits } from '~/common/utils/money';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import type { ListShopOrdersQueryDto } from '../../../api/rest/dto/list-shop-orders.query.dto';
import { toShopOrderSummary } from '../../shop-order-read-model';
import type { ShopOrderListResult } from '../../order.types';

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

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ListShopOrdersUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    shopId: string,
    query: ListShopOrdersQueryDto
  ): Promise<ShopOrderListResult> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(OrderEntity);
    const baseWhere = this.buildWhere(shopId, query);
    const resolvedWhere = query.status?.length
      ? this.mergeWhere(baseWhere, { status: { $in: query.status } })
      : baseWhere;

    const [orders, totalResults, allCount, ...statusCountValues] = await Promise.all([
      repository.findAndCount(
        resolvedWhere,
        {
          populate: ['shop'],
          orderBy: { createdAt: 'desc' },
          offset: (query.page - 1) * query.limit,
          limit: query.limit,
        }
      ),
      repository.count(baseWhere),
      ...SELLER_STATUS_COUNTS.map(status =>
        repository.count(this.mergeWhere(baseWhere, { status }))
      ),
    ]).then(([listResult, totalBaseCount, ...counts]) => [listResult[0], listResult[1], totalBaseCount, ...counts] as const);

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
        toShopOrderSummary(order, itemsByOrderId.get(order.id) ?? [])
      ),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
      statusCounts,
    };
  }

  private buildWhere(
    shopId: string,
    query: ListShopOrdersQueryDto
  ): FilterQuery<OrderEntity> {
    const where: FilterQuery<OrderEntity> = { shop: shopId };
    const andConditions: FilterQuery<OrderEntity>[] = [];

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
      const searchConditions: FilterQuery<OrderEntity>[] = [
        { customerEmail: { $ilike: `%${search}%` } },
        { orderNumber: { $ilike: `%${search}%` } },
      ];

      if (UUID_V4_REGEX.test(search)) {
        searchConditions.push({ id: search });
      }

      andConditions.push({
        $or: searchConditions,
      });
    }

    return andConditions.length > 0
      ? { ...where, $and: andConditions }
      : where;
  }

  private mergeWhere(
    where: FilterQuery<OrderEntity>,
    extra: Record<string, unknown>
  ): FilterQuery<OrderEntity> {
    return {
      ...(where as Record<string, unknown>),
      ...extra,
    } as FilterQuery<OrderEntity>;
  }
}
