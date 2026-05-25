import type {
  AdminOrderListResult,
  AdminOrderDetail,
  CreateOrderResult,
  MyOrderDetail,
  OrderListResult,
  ShopOrderDetail,
  ShopOrderListResult,
  ShopOrderSummary
} from '../../app/order.types';

function toPaymentResponse(order: {
  paymentType: string;
  refundedAt?: Date;
  paymentDetails?: Record<string, unknown>;
}) {
  const refundStatus = typeof order.paymentDetails?.['refund_status'] === 'string'
    ? order.paymentDetails['refund_status']
    : undefined;
  const refundFailedReason = typeof order.paymentDetails?.['refund_failed_reason'] === 'string'
    ? order.paymentDetails['refund_failed_reason']
    : undefined;

  return {
    type: order.paymentType,
    ...(refundStatus ? { refund_status: refundStatus } : {}),
    ...(order.refundedAt ? { refunded_at: order.refundedAt } : {}),
    ...(refundFailedReason ? { refund_failed_reason: refundFailedReason } : {}),
  };
}

export function toCreateOrderResponse(result: CreateOrderResult) {
  return {
    checkout_session_url: result.checkoutSessionUrl,
    checkout_pending: result.checkoutPending ?? false,
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.id,
      shop: {
        id: orderShop.shopId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
    })),
  };
}

export function toCheckoutSessionOrderResponse(result: CreateOrderResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      shop: {
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
    })),
  };
}

export function toOrderListResponse(result: OrderListResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.id,
      shop: {
        id: orderShop.shopId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
      payment: toPaymentResponse(orderShop),
      status: orderShop.status,
      products: orderShop.products.map((product) => ({
        product: {
          id: product.productId,
          slug: product.slug,
          shop: {
            slug: product.shopSlug,
          },
          variant_group_name: product.variantGroupName,
          variant_sub_group_name: product.variantSubGroupName,
          shipping: {},
        },
        inventory: {
          variant: product.variantName,
        },
        percent_coupon: product.percentCouponPercent
          ? { percent_off: product.percentCouponPercent }
          : null,
        id: product.id,
        title: product.title,
        image_url: product.imageUrl,
        quantity: product.quantity,
        price: product.price,
        sale_price: product.salePrice,
      })),
      promo_coupons: orderShop.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      shipping: {
        shipping_status: orderShop.shippingStatus,
        updated_at: orderShop.shippingUpdatedAt,
        to_country: orderShop.shippingToCountry,
        from_countries: orderShop.shippingFromCountries,
        estimated_delivery: orderShop.shippingEstimatedDelivery,
        tracking_number: orderShop.trackingNumber,
        shipping_carrier: orderShop.shippingCarrier,
        shipment_note: orderShop.shipmentNote,
        shipped_at: orderShop.shippedAt,
        delivered_at: orderShop.deliveredAt,
      },
      subtotal: orderShop.subtotal,
      total_shipping_fee: orderShop.totalShippingFee,
      total_discount: orderShop.totalDiscount,
      total: orderShop.total,
      note: orderShop.note,
      canceled_at: orderShop.canceledAt,
      cancel_reason: orderShop.cancelReason,
      customer_support_note: orderShop.customerSupportNote,
      cancel_requested_at: orderShop.cancelRequestedAt,
      created_at: orderShop.createdAt,
    })),
  };
}

function toShopOrderProductResponse(orderShop: ShopOrderSummary) {
  return orderShop.products.map((product) => ({
    id: product.id,
    title: product.title,
    image_url: product.imageUrl,
    quantity: product.quantity,
    price: product.price,
    sale_price: product.salePrice,
    inventory: {
      variant: product.variantName,
    },
    product: {
      id: product.productId,
      slug: product.slug,
      shop: {
        slug: product.shopSlug,
      },
      variant_group_name: product.variantGroupName,
      variant_sub_group_name: product.variantSubGroupName,
    },
    percent_coupon: product.percentCouponPercent
      ? { percent_off: product.percentCouponPercent }
      : null,
  }));
}

function toShopOrderSummaryResponse(orderShop: ShopOrderSummary) {
  return {
    id: orderShop.id,
    shop: {
      id: orderShop.shopId,
      shop_name: orderShop.shopName,
      slug: orderShop.shopSlug,
    },
    customer: {
      email: orderShop.customerEmail,
      full_name: orderShop.customerFullName,
    },
    payment: toPaymentResponse(orderShop),
    status: orderShop.status,
    products: toShopOrderProductResponse(orderShop),
    promo_coupons: orderShop.promoCodes.map((code) => ({
      id: code,
      code,
    })),
    shipping: {
      shipping_status: orderShop.shippingStatus,
      updated_at: orderShop.shippingUpdatedAt,
      to_country: orderShop.shippingToCountry,
      from_countries: orderShop.shippingFromCountries,
      estimated_delivery: orderShop.shippingEstimatedDelivery,
      tracking_number: orderShop.trackingNumber,
      shipping_carrier: orderShop.shippingCarrier,
      shipment_note: orderShop.shipmentNote,
      shipped_at: orderShop.shippedAt,
      delivered_at: orderShop.deliveredAt,
    },
    subtotal: orderShop.subtotal,
    total_shipping_fee: orderShop.totalShippingFee,
    total_discount: orderShop.totalDiscount,
    total: orderShop.total,
    note: orderShop.note,
    canceled_at: orderShop.canceledAt,
    cancel_reason: orderShop.cancelReason,
    customer_support_note: orderShop.customerSupportNote,
    cancel_requested_at: orderShop.cancelRequestedAt,
    created_at: orderShop.createdAt,
  };
}

export function toShopOrderListResponse(result: ShopOrderListResult) {
  return {
    results: result.results.map(toShopOrderSummaryResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}

export function toShopOrderDetailResponse(order: ShopOrderDetail) {
  return {
    order: {
      ...toShopOrderSummaryResponse(order),
      shipping_address: {
        full_name: order.shippingAddress.fullName,
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.zip,
        phone: order.shippingAddress.phone,
      },
    },
  };
}

export function toMyOrderDetailResponse(order: MyOrderDetail) {
  return {
    order_shop: {
      id: order.id,
      shop: {
        id: order.shopId,
        shop_name: order.shopName,
        slug: order.shopSlug,
      },
      customer: {
        email: order.customerEmail,
      },
      payment: toPaymentResponse(order),
      status: order.status,
      products: order.products.map((product) => ({
        product: {
          id: product.productId,
          slug: product.slug,
          shop: {
            slug: product.shopSlug,
          },
          variant_group_name: product.variantGroupName,
          variant_sub_group_name: product.variantSubGroupName,
          shipping: {},
        },
        inventory: {
          variant: product.variantName,
        },
        percent_coupon: product.percentCouponPercent
          ? { percent_off: product.percentCouponPercent }
          : null,
        id: product.id,
        title: product.title,
        image_url: product.imageUrl,
        quantity: product.quantity,
        price: product.price,
        sale_price: product.salePrice,
      })),
      promo_coupons: order.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      shipping: {
        shipping_status: order.shippingStatus,
        updated_at: order.shippingUpdatedAt,
        to_country: order.shippingToCountry,
        from_countries: order.shippingFromCountries,
        estimated_delivery: order.shippingEstimatedDelivery,
        tracking_number: order.trackingNumber,
        shipping_carrier: order.shippingCarrier,
        shipment_note: order.shipmentNote,
        shipped_at: order.shippedAt,
        delivered_at: order.deliveredAt,
      },
      shipping_address: {
        full_name: order.shippingAddress.fullName,
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.zip,
        phone: order.shippingAddress.phone,
      },
      subtotal: order.subtotal,
      total_shipping_fee: order.totalShippingFee,
      total_discount: order.totalDiscount,
      total: order.total,
      note: order.note,
      canceled_at: order.canceledAt,
      cancel_reason: order.cancelReason,
      customer_support_note: order.customerSupportNote,
      cancel_requested_at: order.cancelRequestedAt,
      created_at: order.createdAt,
    },
  };
}

export function toAdminOrderDetailResponse(order: AdminOrderDetail) {
  return {
    order: {
      id: order.id,
      shop: {
        id: order.shopId,
        shop_name: order.shopName,
        slug: order.shopSlug,
      },
      customer: {
        email: order.customerEmail,
      },
      payment: {
        type: order.paymentType,
        details: order.paymentDetails ?? null,
      },
      status: order.status,
      products: order.products.map((product) => ({
        product: {
          id: product.productId,
          slug: product.slug,
          shop: {
            slug: product.shopSlug,
          },
          variant_group_name: product.variantGroupName,
          variant_sub_group_name: product.variantSubGroupName,
          shipping: {},
        },
        inventory: {
          variant: product.variantName,
        },
        percent_coupon: product.percentCouponPercent
          ? { percent_off: product.percentCouponPercent }
          : null,
        id: product.id,
        title: product.title,
        image_url: product.imageUrl,
        quantity: product.quantity,
        price: product.price,
        sale_price: product.salePrice,
      })),
      promo_coupons: order.promoCodes.map((code) => ({
        id: code,
        code,
      })),
      shipping: {
        shipping_status: order.shippingStatus,
        updated_at: order.shippingUpdatedAt,
        to_country: order.shippingToCountry,
        from_countries: order.shippingFromCountries,
        estimated_delivery: order.shippingEstimatedDelivery,
        tracking_number: order.trackingNumber,
        shipping_carrier: order.shippingCarrier,
        shipment_note: order.shipmentNote,
        shipped_at: order.shippedAt,
        delivered_at: order.deliveredAt,
      },
      shipping_address: {
        full_name: order.shippingAddress.fullName,
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2,
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.zip,
        phone: order.shippingAddress.phone,
      },
      subtotal: order.subtotal,
      total_shipping_fee: order.totalShippingFee,
      total_discount: order.totalDiscount,
      total: order.total,
      note: order.note,
      support_note: order.supportNote,
      canceled_at: order.canceledAt,
      cancel_reason: order.cancelReason,
      refunded_at: order.refundedAt,
      created_at: order.createdAt,
    },
  };
}

export function toAdminOrderListResponse(result: AdminOrderListResult) {
  return {
    results: result.results.map((order) => ({
      id: order.id,
      shop: {
        id: order.shopId,
        shop_name: order.shopName,
        slug: order.shopSlug,
      },
      customer: {
        email: order.customerEmail,
      },
      payment: {
        type: order.paymentType,
      },
      status: order.status,
      shipping: {
        shipping_status: order.shippingStatus,
      },
      total: order.total,
      support_note: order.supportNote,
      cancel_reason: order.cancelReason,
      refunded_at: order.refundedAt,
      created_at: order.createdAt,
    })),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
