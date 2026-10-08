import type { FulfillmentOrderView } from '../../fulfillment/app/fulfillment.types';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import { buildOrderFulfillmentSummary } from './order-fulfillment';
import { getRequiredOrderNumber } from './order-number';
import {
  parsePersistedOrderShippingSnapshot,
} from '../../checkout/app/checkout-shipping-snapshot.contract';
import type { AdminOrderDetail } from './order.types';
import {
  getOrderDiscountMajor,
  getOrderItemAmountMinor,
  getOrderItemOriginalAmountMinor,
  getOrderDiscountMinor,
  getOrderShippingMajor,
  getOrderShippingMinor,
  getOrderSubtotalMajor,
  getOrderSubtotalMinor,
  getOrderTotalMinor,
  getOrderTotalMajor,
} from './order-money';

export function toAdminOrderDetail(
  order: OrderEntity,
  items: OrderItemEntity[],
  fulfillmentView?: FulfillmentOrderView,
): AdminOrderDetail {
  return {
    id: order.id,
    publicId: order.publicId,
    orderNumber: getRequiredOrderNumber(order),
    shopId: order.shop.id,
    shopPublicId: order.shop.publicId,
    shopName: order.shop.shopName,
    shopSlug: order.shop.slug,
    currency: order.currency,
    customerEmail: order.customerEmail,
    paymentType: order.paymentType,
    status: order.status,
    products: items.map((item) => ({
      id: item.id,
      productId: item.product.id,
      productPublicId: item.product.publicId,
      slug: item.product.slug,
      shopSlug: item.product.shop.slug,
      title: item.title,
      imageUrl: item.imageUrl,
      imageReference: item.imageReference,
      quantity: item.quantity,
      amountMinor: getOrderItemAmountMinor(item, order.currency),
      originalAmountMinor: getOrderItemOriginalAmountMinor(item),
      promoDiscountMinor: item.promoDiscountMinor ?? 0,
      currency: order.currency,
      sku: item.sku,
      selectedOptions: item.selectedOptions ?? [],

    })),
    promoCodes: order.promoCodes,
    fulfillment: buildOrderFulfillmentSummary(order, fulfillmentView),
    canceledAt: order.canceledAt,
    cancelReason: order.cancelReason,
    refundedAt: order.refundedAt,
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
    shippingAddress: {
      fullName: String(order.shippingAddress?.full_name ?? ''),
      address1: String(order.shippingAddress?.address1 ?? ''),
      ...(order.shippingAddress?.address2
        ? { address2: String(order.shippingAddress.address2) }
        : {}),
      city: String(order.shippingAddress?.city ?? ''),
      country: String(order.shippingAddress?.country ?? ''),
      state: String(order.shippingAddress?.state ?? ''),
      zip: String(order.shippingAddress?.zip ?? ''),
      ...(order.shippingAddress?.phone
        ? { phone: String(order.shippingAddress.phone) }
        : {}),
    },
    supportNote: order.supportNote,
    paymentDetails: order.paymentDetails,
  };
}
