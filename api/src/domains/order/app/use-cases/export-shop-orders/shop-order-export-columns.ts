import { ShopOrderExportColumnPreset } from '../../../api/rest/dto/export-shop-orders.query.dto';
import type { ShopOrderExportRow } from '../../ports/shop-order-export-query.repository';

export type ExportColumn = {
  id: string;
  label: string;
  read: (row: ShopOrderExportRow) => unknown;
};

export const EXPORT_COLUMNS: ExportColumn[] = [
  { id: 'id', label: 'ID', read: row => row.id },
  { id: 'order_number', label: 'Order number', read: row => row.orderNumber },
  { id: 'created_at', label: 'Created date (UTC)', read: row => row.createdAt },
  { id: 'customer_email', label: 'Customer email', read: row => row.customerEmail },
  { id: 'customer_full_name', label: 'Customer full name', read: row => row.customerFullName },
  { id: 'status', label: 'Status', read: row => row.status },
  { id: 'payment_type', label: 'Payment type', read: row => row.paymentType },
  { id: 'refund_status', label: 'Refund status', read: row => row.refundStatus },
  { id: 'refunded_at', label: 'Refunded date (UTC)', read: row => row.refundedAt },
  { id: 'currency', label: 'Currency', read: row => row.currency },
  { id: 'subtotal_minor', label: 'Subtotal minor', read: row => row.subtotalMinor },
  { id: 'shipping_minor', label: 'Shipping minor', read: row => row.shippingMinor },
  { id: 'discount_minor', label: 'Discount minor', read: row => row.discountMinor },
  { id: 'total_minor', label: 'Total minor', read: row => row.totalMinor },
  { id: 'promo_codes', label: 'Promo codes', read: row => row.promoCodes.join(', ') },
  { id: 'shipping_status', label: 'Shipping status', read: row => row.shippingStatus },
  { id: 'shipping_to_country', label: 'Shipping to country', read: row => row.shippingToCountry },
  { id: 'shipping_from_countries', label: 'Shipping from countries', read: row => row.shippingFromCountries.join(', ') },
  { id: 'tracking_number', label: 'Tracking number', read: row => row.trackingNumber },
  { id: 'shipping_carrier', label: 'Shipping carrier', read: row => row.shippingCarrier },
  { id: 'canceled_at', label: 'Canceled date (UTC)', read: row => row.canceledAt },
  { id: 'cancel_reason', label: 'Cancel reason', read: row => row.cancelReason },
  { id: 'note', label: 'Seller note', read: row => row.note },
  { id: 'customer_support_note', label: 'Customer support note', read: row => row.customerSupportNote },
  { id: 'shipment_note', label: 'Shipment note', read: row => row.shipmentNote },
  { id: 'shop_id', label: 'Shop ID', read: row => row.shopId },
  { id: 'shop_name', label: 'Shop name', read: row => row.shopName },
];

export const DEFAULT_EXPORT_COLUMN_IDS = [
  'id',
  'order_number',
  'created_at',
  'customer_email',
  'customer_full_name',
  'status',
  'payment_type',
  'refund_status',
  'refunded_at',
  'currency',
  'subtotal_minor',
  'shipping_minor',
  'discount_minor',
  'total_minor',
  'promo_codes',
  'shipping_status',
  'shipping_to_country',
  'shipping_from_countries',
  'tracking_number',
  'shipping_carrier',
  'canceled_at',
  'cancel_reason',
  'note',
];

export function resolveExportColumns(
  columnPreset: ShopOrderExportColumnPreset,
  requestedColumnIds?: string[],
) {
  if (columnPreset !== ShopOrderExportColumnPreset.CUSTOM) {
    return getDefaultExportColumns();
  }

  const requestedIds = new Set(requestedColumnIds ?? []);
  const columns = EXPORT_COLUMNS.filter(column => requestedIds.has(column.id));

  return columns.length > 0 ? columns : getDefaultExportColumns();
}

export function getShopOrderExportColumns() {
  return EXPORT_COLUMNS.map(column => ({
    id: column.id,
    label: column.label,
    default: DEFAULT_EXPORT_COLUMN_IDS.includes(column.id),
  }));
}

function getDefaultExportColumns() {
  return EXPORT_COLUMNS.filter(column => DEFAULT_EXPORT_COLUMN_IDS.includes(column.id));
}
