import type {
  AdminOrderListResult,
  CheckoutQuoteResult,
  AdminOrderDetail,
  CreateOrderResult,
  MyOrderDetail,
  OrderListResult,
  ShopOrderDetail,
  ShopOrderListResult,
  ShopOrderSummary
} from '../../app/order.types';
import { toMinorUnits } from '~/common/utils/money';
import type { CheckoutConfig } from '~/config/checkout.config';
import { getMaxOrderTotalMinor } from '~/config/checkout.config';

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

function toMinorTotals(input: {
  currency: string;
  subtotal: number;
  subtotalMinor?: number;
  totalShippingFee: number;
  shippingMinor?: number;
  totalDiscount: number;
  discountMinor?: number;
  total: number;
  totalMinor?: number;
}) {
  return {
    currency: input.currency,
    subtotal_minor: input.subtotalMinor ?? toMinorUnits(input.subtotal, input.currency),
    shipping_minor: input.shippingMinor ?? toMinorUnits(input.totalShippingFee, input.currency),
    discount_minor: input.discountMinor ?? toMinorUnits(input.totalDiscount, input.currency),
    total_minor: input.totalMinor ?? toMinorUnits(input.total, input.currency),
  };
}

export function toCreateOrderResponse(result: CreateOrderResult) {
  return {
    checkout_session_url: result.checkoutSessionUrl,
    checkout_pending: result.checkoutPending ?? false,
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.id,
      order_number: orderShop.orderNumber,
      shop: {
        id: orderShop.shopId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
    })),
  };
}

export function toCheckoutQuoteResponse(
  result: CheckoutQuoteResult,
  checkoutConfig?: CheckoutConfig
) {
  return {
    quote_id: result.quoteId,
    presentment_currency: result.presentmentCurrency,
    checkout_currency: result.checkoutCurrency,
    ...(checkoutConfig
      ? {
        checkout_policy: {
          max_order_total_minor: getMaxOrderTotalMinor(
            checkoutConfig,
            result.checkoutCurrency
          ),
        },
      }
      : {}),
    subtotal_minor: result.subtotalMinor,
    shipping_minor: result.shippingMinor,
    discount_minor: result.discountMinor,
    total_minor: result.totalMinor,
    expires_at: result.expiresAt,
    items: result.items.map((item) => ({
      inventory_id: item.inventoryId,
      title: item.title,
      image_url: item.imageUrl,
      quantity: item.quantity,
      source_currency: item.sourceCurrency,
      unit_price_source_minor: item.unitPriceSourceMinor,
      line_total_source_minor: item.lineTotalSourceMinor,
      checkout_currency: item.checkoutCurrency,
      unit_price_checkout_minor: item.unitPriceCheckoutMinor,
      line_total_checkout_minor: item.lineTotalCheckoutMinor,
      original_amount_minor: item.originalAmountMinor,
      currency: item.checkoutCurrency,
      source_type: item.sourceType,
      fx_rate: item.fxRate,
      fx_source: item.fxSource,
      fx_effective_at: item.fxEffectiveAt,
      variant_name: item.variantName,
      variant_group_name: item.variantGroupName,
      variant_sub_group_name: item.variantSubGroupName,
    })),
  };
}

export function toCheckoutSessionOrderResponse(result: CreateOrderResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      order_number: orderShop.orderNumber,
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
      order_number: orderShop.orderNumber,
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
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        currency: product.currency,
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
      ...toMinorTotals(orderShop),
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
    amount_minor: product.amountMinor,
    original_amount_minor: product.originalAmountMinor,
    currency: product.currency,
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
    order_number: orderShop.orderNumber,
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
    ...toMinorTotals(orderShop),
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
    status_counts: result.statusCounts,
  };
}

export function toShopOrderDetailResponse(order: ShopOrderDetail) {
  return {
    order: {
      ...toShopOrderSummaryResponse(order),
      products: order.products.map((product) => ({
        id: product.id,
        title: product.title,
        ...(product.imageStorageKey ? { storage_key: product.imageStorageKey } : {}),
        quantity: product.quantity,
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        currency: product.currency,
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
      })),
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
    timeline: order.timeline.map((event) => ({
      id: event.id,
      type: event.type,
      occurred_at: event.occurredAt,
      actor_type: event.actorType,
      actor_id: event.actorId,
      source: event.source,
      payload: event.payload,
    })),
  };
}

export function toMyOrderDetailResponse(order: MyOrderDetail) {
  return {
    order_shop: {
      id: order.id,
      order_number: order.orderNumber,
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
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        currency: product.currency,
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
      ...toMinorTotals(order),
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
      order_number: order.orderNumber,
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
        amount_minor: product.amountMinor,
        original_amount_minor: product.originalAmountMinor,
        currency: product.currency,
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
      ...toMinorTotals(order),
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
      order_number: order.orderNumber,
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
      currency: order.currency,
      total_minor: order.totalMinor ?? toMinorUnits(order.total, order.currency),
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
