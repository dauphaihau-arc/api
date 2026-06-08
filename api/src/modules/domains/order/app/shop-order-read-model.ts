import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import { ProductImageVariant } from '../../product/domain/enums/product-image-variant.enum';
import { getRequiredOrderNumber } from './order-number';
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

function resolveOrderItemImageStorageKey(item: OrderItemEntity): string | undefined {
  const primaryImage = item.product.images
    .getItems()
    .sort((left, right) => left.rank - right.rank)[0];

  if (!primaryImage) {
    return undefined;
  }

  const thumbVariant = primaryImage.variants
    .getItems()
    .find((variant) => variant.variant === ProductImageVariant.THUMB_1X1);

  return thumbVariant?.storageKey ?? primaryImage.storageKey;
}

function toOrderProducts(
  items: OrderItemEntity[],
  currency: string,
  options?: { includeImageStorageKey?: boolean }
): OrderListProduct[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.product.slug,
    imageUrl: item.imageUrl,
    ...(options?.includeImageStorageKey
      ? { imageStorageKey: resolveOrderItemImageStorageKey(item) }
      : {}),
    quantity: item.quantity,
    amountMinor: getOrderItemAmountMinor(item, currency),
    originalAmountMinor: getOrderItemOriginalAmountMinor(item),
    currency,
    variantName: item.variantName,
    variantGroupName: item.variantGroupName,
    variantSubGroupName: item.variantSubGroupName,
    productId: item.product.id,
    shopSlug: item.product.shop.slug,
    percentCouponPercent: item.percentCouponPercent ?? null,
  }));
}

function toShippingAddress(
  input: Record<string, unknown> | undefined
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
  items: OrderItemEntity[]
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
    shippingStatus: order.shippingStatus,
    shippingUpdatedAt: order.updatedAt,
    shippingToCountry: order.shippingToCountry,
    shippingFromCountries: order.shippingOriginCountries,
    shippingEstimatedDelivery: order.shippingEstimatedDelivery,
    trackingNumber: order.trackingNumber,
    shippingCarrier: order.shippingCarrier,
    shipmentNote: order.shipmentNote,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
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
    total: getOrderTotalMajor(order),
    totalMinor: getOrderTotalMinor(order),
    note: order.note,
    createdAt: order.createdAt,
  };
}

export function toShopOrderDetail(
  order: OrderEntity,
  items: OrderItemEntity[],
  timeline: OrderTimelineEvent[]
): ShopOrderDetail {
  return {
    ...toShopOrderSummary(order, []),
    products: toOrderProducts(items, order.currency, { includeImageStorageKey: true }),
    shippingAddress: toShippingAddress(order.shippingAddress),
    timeline,
  };
}
