import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { ExportShopOrdersQueryDto } from '../../../api/rest/dto/export-shop-orders.query.dto';
import {
  ShopOrderExportQueryRepository,
  type ShopOrderExportRow,
} from '../../../app/ports/shop-order-export-query.repository';
import { buildShopOrderWhere, mergeShopOrderWhere } from '../../../app/use-cases/list-shop-orders/shop-order-query-filter';
import { canceledFulfillmentOrderIds } from '../../../app/order-fulfillment';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import type { FulfillmentOrderView } from '../../../../fulfillment/app/fulfillment.types';
import { OrderEntity } from '../entities/order.entity';
import {
  parsePersistedOrderShippingSnapshot,
} from '../../../../checkout/app/checkout-shipping-snapshot.contract';

@Injectable()
export class MikroOrmShopOrderExportQueryRepository
implements ShopOrderExportQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

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

    const fulfillmentViews = await this.orderFulfillmentViewPort.load(
      entityManager,
      orders.map((order) => order.id),
      { canceledOrderIds: canceledFulfillmentOrderIds(orders) },
    );

    return orders.map((order) =>
      toShopOrderExportRow(order, fulfillmentViews.get(order.id)),
    );
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

function toShopOrderExportRow(
  order: OrderEntity,
  view?: FulfillmentOrderView,
): ShopOrderExportRow {
  const shippingQuote = parsePersistedOrderShippingSnapshot(order.shippingQuoteSnapshot);

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
    fulfillmentStatus: order.fulfillmentStatus,
    shipmentsSummary: serializeShipmentsSummary(view),
    legacyTrackingNumber: order.trackingNumber,
    legacyShippingCarrier: order.shippingCarrier,
    legacyShipmentNote: order.shipmentNote,
    shippingToCountry: order.shippingToCountry,
    shippingFromCountries: order.shippingOriginCountries,
    shippingEstimateMinDays: shippingQuote?.shipping.estimate.combinedMinDays,
    shippingEstimateMaxDays: shippingQuote?.shipping.estimate.combinedMaxDays,
    shippingEstimatedLatestDate: shippingQuote?.shipping.estimate.latestDeliveryDate,
    canceledAt: order.canceledAt,
    cancelReason: order.cancelReason,
    note: order.note,
    customerSupportNote: order.customerSupportNote,
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

/**
 * Serializes every Shipment so exports retain shipment identity and quantities
 * instead of silently selecting one tracking number.
 */
function serializeShipmentsSummary(view?: FulfillmentOrderView): string {
  if (!view) {
    return '';
  }

  return view.groups
    .flatMap((group) => group.shipments)
    .map((shipment) => {
      const parts = [
        shipment.id,
        shipment.status,
        shipment.carrier ?? '',
        shipment.trackingNumber ?? '',
        shipment.items
          .map((item) => `${item.orderItemId}:${item.quantity}`)
          .join('|'),
      ];

      return parts.join('; ');
    })
    .join(' || ');
}
