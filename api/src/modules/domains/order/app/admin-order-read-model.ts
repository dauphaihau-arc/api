import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import type { AdminOrderDetail } from './order.types';

export function toAdminOrderDetail(
  order: OrderEntity,
  items: OrderItemEntity[]
): AdminOrderDetail {
  return {
    id: order.id,
    shopId: order.shop.id,
    shopName: order.shop.shopName,
    shopSlug: order.shop.slug,
    customerEmail: order.customerEmail,
    paymentType: order.paymentType,
    status: order.status,
    products: items.map((item) => ({
      id: item.id,
      productId: item.product.id,
      slug: item.product.slug,
      shopSlug: item.product.shop.slug,
      title: item.title,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      price: Number(item.price),
      salePrice: item.salePrice ? Number(item.salePrice) : null,
      variantName: item.variantName,
      variantGroupName: item.variantGroupName,
      variantSubGroupName: item.variantSubGroupName,
      percentCouponPercent: item.percentCouponPercent ?? null,
    })),
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
    refundedAt: order.refundedAt,
    subtotal: Number(order.subtotal),
    totalShippingFee: Number(order.totalShippingFee),
    totalDiscount: Number(order.totalDiscount),
    total: Number(order.total),
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
