import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { ListAdminOrdersQueryDto } from '../../../api/rest/dto/list-admin-orders.query.dto';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { getRequiredOrderNumber } from '../../order-number';
import { getOrderTotalMajor, getOrderTotalMinor } from '../../order-money';
import type { AdminOrderListResult } from '../../order.types';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ListAdminOrdersUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ListAdminOrdersQueryDto): Promise<AdminOrderListResult> {
    const entityManager = this.entityManager.fork();
    const where: FilterQuery<OrderEntity> = {};

    if (query.status) {
      where.status = query.status;
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

      where.$or = searchConditions;
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

    return {
      results: orders.map((order) => ({
        id: order.id,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
        customerEmail: order.customerEmail,
        currency: order.currency,
        paymentType: order.paymentType,
        status: order.status,
        shippingStatus: order.shippingStatus,
        total: getOrderTotalMajor(order),
        totalMinor: getOrderTotalMinor(order),
        supportNote: order.supportNote,
        cancelReason: order.cancelReason,
        refundedAt: order.refundedAt,
        createdAt: order.createdAt,
      })),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
    };
  }
}
