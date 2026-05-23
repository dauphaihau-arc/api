import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { ListAdminOrdersQueryDto } from '../../../api/rest/dto/list-admin-orders.query.dto';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import type { AdminOrderListResult } from '../../order.types';

@Injectable()
export class ListAdminOrdersUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ListAdminOrdersQueryDto): Promise<AdminOrderListResult> {
    const entityManager = this.entityManager.fork();
    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.$or = [
        { customerEmail: { $ilike: `%${search}%` } },
        { id: search },
      ];
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
        shopId: order.shop.id,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
        customerEmail: order.customerEmail,
        paymentType: order.paymentType,
        status: order.status,
        shippingStatus: order.shippingStatus,
        total: Number(order.total),
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
