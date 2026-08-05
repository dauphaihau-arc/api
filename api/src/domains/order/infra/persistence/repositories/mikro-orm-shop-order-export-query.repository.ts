import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { ExportShopOrdersQueryDto } from '../../../api/rest/dto/export-shop-orders.query.dto';
import {
  ShopOrderExportQueryRepository,
  type ShopOrderExportRow,
} from '../../../app/ports/shop-order-export-query.repository';
import { buildShopOrderWhere, mergeShopOrderWhere } from '../../../app/use-cases/list-shop-orders/shop-order-query-filter';
import { OrderEntity } from '../entities/order.entity';

@Injectable()
export class MikroOrmShopOrderExportQueryRepository
implements ShopOrderExportQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async countForExport(
    shopId: string,
    query: ExportShopOrdersQueryDto,
  ): Promise<number> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(OrderEntity);
    const where = this.buildWhere(shopId, query);

    return repository.count(where);
  }

  async listForExport(
    shopId: string,
    query: ExportShopOrdersQueryDto,
    limit: number,
  ): Promise<ShopOrderExportRow[]> {
    return this.listForExportBatch(shopId, query, 0, limit);
  }

  async listForExportBatch(
    shopId: string,
    query: ExportShopOrdersQueryDto,
    offset: number,
    limit: number,
  ): Promise<ShopOrderExportRow[]> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(OrderEntity);
    const where = this.buildWhere(shopId, query);

    const orders = await repository.find(where, {
      populate: ['shop'],
      orderBy: { createdAt: 'desc' },
      offset,
      limit,
    });

    return orders.map(toShopOrderExportRow);
  }

  private buildWhere(
    shopId: string,
    query: ExportShopOrdersQueryDto,
  ) {
    const baseWhere = buildShopOrderWhere(shopId, query);

    return query.status?.length
      ? mergeShopOrderWhere(baseWhere, { status: { $in: query.status } })
      : baseWhere;
  }
}

function toShopOrderExportRow(order: OrderEntity): ShopOrderExportRow {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerEmail: order.customerEmail,
    customerFullName: readRecordValue(order.shippingAddress, 'full_name'),
    status: order.status,
    paymentType: order.paymentType,
    refundStatus: readRecordValue(order.paymentDetails, 'refund_status'),
    refundedAt: order.refundedAt,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    shippingMinor: order.shippingMinor,
    discountMinor: order.discountMinor,
    totalMinor: order.totalMinor,
    promoCodes: order.promoCodes,
    shippingStatus: order.shippingStatus,
    shippingToCountry: order.shippingToCountry,
    shippingFromCountries: order.shippingOriginCountries,
    trackingNumber: order.trackingNumber,
    shippingCarrier: order.shippingCarrier,
    canceledAt: order.canceledAt,
    cancelReason: order.cancelReason,
    note: order.note,
    customerSupportNote: order.customerSupportNote,
    shipmentNote: order.shipmentNote,
    shopId: order.shop.id,
    shopName: order.shop.shopName,
  };
}

function readRecordValue(
  record: Record<string, unknown> | undefined,
  key: string,
) {
  const value = record?.[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;
}
