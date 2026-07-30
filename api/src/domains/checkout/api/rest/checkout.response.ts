import type {
  CheckoutQuoteResult,
  CreateOrderResult,
  OrderListResult,
} from '../../../order/app/order.types';
import type { CheckoutConfig } from '~/platform/config/checkout.config';
import { getMaxOrderTotalMinor } from '~/platform/config/checkout.config';

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
  checkoutConfig?: CheckoutConfig,
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
            result.checkoutCurrency,
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

export function toCheckoutOrderListResponse(result: OrderListResult) {
  return {
    order_shops: result.orderShops.map((orderShop) => ({
      id: orderShop.id,
      order_number: orderShop.orderNumber,
      shop: {
        id: orderShop.shopId,
        shop_name: orderShop.shopName,
        slug: orderShop.shopSlug,
      },
      payment: {
        type: orderShop.paymentType,
        ...(typeof orderShop.paymentDetails?.['refund_status'] === 'string'
          ? { refund_status: orderShop.paymentDetails['refund_status'] }
          : {}),
        ...(orderShop.refundedAt ? { refunded_at: orderShop.refundedAt } : {}),
        ...(typeof orderShop.paymentDetails?.['refund_failed_reason'] === 'string'
          ? { refund_failed_reason: orderShop.paymentDetails['refund_failed_reason'] }
          : {}),
      },
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
        estimated_delivery_at: orderShop.shippingEstimatedDelivery,
        tracking_number: orderShop.trackingNumber,
        carrier: orderShop.shippingCarrier,
        note: orderShop.shipmentNote,
        shipped_at: orderShop.shippedAt,
        delivered_at: orderShop.deliveredAt,
      },
      canceled_at: orderShop.canceledAt,
      cancel_reason: orderShop.cancelReason,
      customer_support_note: orderShop.customerSupportNote,
      cancel_requested_at: orderShop.cancelRequestedAt,
      currency: orderShop.currency,
      subtotal_minor: orderShop.subtotalMinor,
      shipping_minor: orderShop.shippingMinor,
      discount_minor: orderShop.discountMinor,
      total_minor: orderShop.totalMinor,
      note: orderShop.note,
      created_at: orderShop.createdAt,
    })),
  };
}
