import type { ExportShopOrdersQueryDto } from '../../api/rest/dto/export-shop-orders.query.dto';

export interface ShopOrderExportRow {
  id: string;
  orderNumber?: string;
  createdAt: Date;
  customerEmail: string;
  customerFullName?: string;
  status: string;
  paymentType: string;
  refundStatus?: string;
  refundedAt?: Date;
  currency: string;
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  totalMinor: number;
  promoCodes: string[];
  shippingStatus: string;
  shippingToCountry: string;
  shippingFromCountries: string[];
  trackingNumber?: string;
  shippingCarrier?: string;
  canceledAt?: Date;
  cancelReason?: string;
  note?: string;
  customerSupportNote?: string;
  shipmentNote?: string;
  shopId: string;
  shopName: string;
}

export abstract class ShopOrderExportQueryRepository {
  abstract countForExport(
    shopId: string,
    query: ExportShopOrdersQueryDto,
  ): Promise<number>;

  abstract listForExport(
    shopId: string,
    query: ExportShopOrdersQueryDto,
    limit: number,
  ): Promise<ShopOrderExportRow[]>;

  abstract listForExportBatch(
    shopId: string,
    query: ExportShopOrdersQueryDto,
    offset: number,
    limit: number,
  ): Promise<ShopOrderExportRow[]>;
}
