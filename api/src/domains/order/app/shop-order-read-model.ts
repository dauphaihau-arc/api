import type { FulfillmentOrderView } from '../../fulfillment/app/fulfillment.types';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import { buildOrderFulfillmentSummary } from './order-fulfillment';
import { getRequiredOrderNumber } from './order-number';
import {
  parsePersistedOrderShippingSnapshot,
} from '../../checkout/app/checkout-shipping-snapshot.contract';
import type {
  OrderListProduct,
  OrderShippingAddressSummary,
  ShopOrderDetail,
  ShopOrderSummary,
  OrderTimelineEvent,
} from './order.types';
import {
  getOrderDiscountMajor,
  getOrderDiscountMinor,
  getOrderItemAmountMinor,
  getOrderItemOriginalAmountMinor,
  getOrderShippingMajor,
  getOrderShippingMinor,
  getOrderSubtotalMajor,
  getOrderSubtotalMinor,
  getOrderTotalMinor,
  getOrderTotalMajor,
} from './order-money';


function toOrderProducts(
  items: OrderItemEntity[],
  currency: string,
  options?: { includeImageStorageKey?: boolean },
): OrderListProduct[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.product.slug,
    imageUrl: item.imageUrl,
    imageReference: item.imageReference,
    ...(options?.includeImageStorageKey
      ? { imageStorageKey: item.imageReference }
      : {}),
    quantity: item.quantity,
    amountMinor: getOrderItemAmountMinor(item, currency),
    originalAmountMinor: getOrderItemOriginalAmountMinor(item),
    promoDiscountMinor: item.promoDiscountMinor ?? 0,
    currency,
    sku: item.sku,
    selectedOptions: item.selectedOptions ?? [],
    productId: item.product.id,
    shopSlug: item.product.shop.slug,

  }));
}

function toShippingAddress(
  input: Record<string, unknown> | undefined,
): OrderShippingAddressSummary {
  return {
    fullName: String(input?.full_name ?? ''),
    address1: String(input?.address1 ?? ''),
    ...(input?.address2 ? { address2: String(input.address2) } : {}),
    city: String(input?.city ?? ''),
    country: String(input?.country ?? ''),
    state: String(input?.state ?? ''),
    zip: String(input?.zip ?? ''),
    ...(input?.phone ? { phone: String(input.phone) } : {}),
  };
}

export function toShopOrderSummary(
  order: OrderEntity,
  items: OrderItemEntity[],
  fulfillmentView?: FulfillmentOrderView,
): ShopOrderSummary {
  const shippingAddress = toShippingAddress(order.shippingAddress);

  return {
    id: order.id,
    orderNumber: getRequiredOrderNumber(order),
    shopId: order.shop.id,
    shopName: order.shop.shopName,
    shopSlug: order.shop.slug,
    currency: order.currency,
    customerEmail: order.customerEmail,
    customerFullName: shippingAddress.fullName,
    paymentType: order.paymentType,
    status: order.status,
    products: toOrderProducts(items, order.currency),
    promoCodes: order.promoCodes,
    fulfillment: buildOrderFulfillmentSummary(order, fulfillmentView),
    canceledAt: order.canceledAt,
    cancelReason: order.cancelReason,
    customerSupportNote: order.customerSupportNote,
    cancelRequestedAt: order.cancelRequestedAt,
    refundedAt: order.refundedAt,
    paymentDetails: order.paymentDetails,
    subtotal: getOrderSubtotalMajor(order),
    subtotalMinor: getOrderSubtotalMinor(order),
    totalShippingFee: getOrderShippingMajor(order),
    shippingMinor: getOrderShippingMinor(order),
    totalDiscount: getOrderDiscountMajor(order),
    discountMinor: getOrderDiscountMinor(order),
    saleDiscountMinor: order.saleDiscountMinor,
    total: getOrderTotalMajor(order),
    totalMinor: getOrderTotalMinor(order),
    shippingQuote: parsePersistedOrderShippingSnapshot(order.shippingQuoteSnapshot),
    note: order.note,
    createdAt: order.createdAt,
  };
}

export function toShopOrderDetail(
  order: OrderEntity,
  items: OrderItemEntity[],
  timeline: OrderTimelineEvent[],
  fulfillmentView?: FulfillmentOrderView,
): ShopOrderDetail {
  return {
    ...toShopOrderSummary(order, [], fulfillmentView),
    products: toOrderProducts(items, order.currency, { includeImageStorageKey: true }),
    shippingAddress: toShippingAddress(order.shippingAddress),
    timeline,
  };
}
