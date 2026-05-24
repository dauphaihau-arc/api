import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import type {
  OrderListProduct,
  OrderShippingAddressSummary,
  ShopOrderDetail,
  ShopOrderSummary
} from './order.types';

function toOrderProducts(items: OrderItemEntity[]): OrderListProduct[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.product.slug,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    price: Number(item.price),
    salePrice: item.salePrice ? Number(item.salePrice) : null,
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
    shopId: order.shop.id,
    shopName: order.shop.shopName,
    shopSlug: order.shop.slug,
    customerEmail: order.customerEmail,
    customerFullName: shippingAddress.fullName,
    paymentType: order.paymentType,
    status: order.status,
    products: toOrderProducts(items),
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
    subtotal: Number(order.subtotal),
    totalShippingFee: Number(order.totalShippingFee),
    totalDiscount: Number(order.totalDiscount),
    total: Number(order.total),
    note: order.note,
    createdAt: order.createdAt,
  };
}

export function toShopOrderDetail(
  order: OrderEntity,
  items: OrderItemEntity[]
): ShopOrderDetail {
  return {
    ...toShopOrderSummary(order, items),
    shippingAddress: toShippingAddress(order.shippingAddress),
  };
}
