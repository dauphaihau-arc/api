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
  { id: 'fulfillment_status', label: 'Fulfillment status', read: row => row.fulfillmentStatus },
  { id: 'shipments', label: 'Shipments', read: row => row.shipmentsSummary },
  { id: 'legacy_tracking_number', label: 'Legacy tracking number', read: row => row.legacyTrackingNumber },
  { id: 'legacy_shipping_carrier', label: 'Legacy shipping carrier', read: row => row.legacyShippingCarrier },
  { id: 'legacy_shipment_note', label: 'Legacy shipment note', read: row => row.legacyShipmentNote },
  { id: 'shipping_to_country', label: 'Shipping to country', read: row => row.shippingToCountry },
  { id: 'shipping_from_countries', label: 'Shipping from countries', read: row => row.shippingFromCountries.join(', ') },
  {
    id: 'shipping_estimate_days',
    label: 'Shipping estimate (days)',
    read: row => (row.shippingEstimateMinDays != null && row.shippingEstimateMaxDays != null
      ? `${row.shippingEstimateMinDays}-${row.shippingEstimateMaxDays}`
      : ''),
  },
  {
    id: 'shipping_estimated_delivery',
    label: 'Estimated delivery (UTC)',
    read: row => row.shippingEstimatedLatestDate,
  },
  { id: 'canceled_at', label: 'Canceled date (UTC)', read: row => row.canceledAt },
  { id: 'cancel_reason', label: 'Cancel reason', read: row => row.cancelReason },
  { id: 'note', label: 'Seller note', read: row => row.note },
  { id: 'customer_support_note', label: 'Customer support note', read: row => row.customerSupportNote },
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
  'fulfillment_status',
  'shipments',
  'legacy_tracking_number',
  'legacy_shipping_carrier',
  'shipping_to_country',
  'shipping_from_countries',
  'shipping_estimate_days',
  'shipping_estimated_delivery',
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
