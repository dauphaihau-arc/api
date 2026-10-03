import type {
  CheckoutQuoteResult,
  CreateOrderResult,
  OrderFulfillmentSummary,
  OrderListResult,
} from '../../../order/app/order.types';
import type { CheckoutConfig } from '~/platform/config/checkout.config';
import { getMaxOrderTotalMinor } from '~/platform/config/checkout.config';
import {
  toPersistedShippingDiscount,
  toPersistedShippingQuote,
} from '../../app/checkout-shipping-snapshot.contract';
import { toOrderShippingResponse } from '../../../order/api/rest/order.response';
function toCheckoutFulfillmentResponse(fulfillment: OrderFulfillmentSummary) {
  const toProgressResponse = (
    progress: OrderFulfillmentSummary['progress'],
  ) => ({
    ordered: progress.ordered,
    prepared: progress.prepared,
    dispatched: progress.dispatched,
    delivered: progress.delivered,
    canceled: progress.canceled,
    outstanding: progress.outstanding,
  });

  return {
    status: fulfillment.status,
    requires_reconciliation: fulfillment.requiresReconciliation,
    progress: toProgressResponse(fulfillment.progress),
    groups: fulfillment.groups.map((group) => ({
      id: group.id,
      method: group.method,
      operator: group.operator,
      provenance: group.provenance,
      items: group.items.map((item) => ({
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      })),
      progress: toProgressResponse(group.progress),
      shipments: group.shipments.map((shipment) => ({
        id: shipment.id,
        group_id: shipment.groupId,
        status: shipment.status,
        carrier: shipment.carrier,
        tracking_number: shipment.trackingNumber,
        shipment_note: shipment.note,
        origin_countries: shipment.originCountries,
        prepared_at: shipment.preparedAt,
        dispatched_at: shipment.dispatchedAt,
        delivered_at: shipment.deliveredAt,
        voided_at: shipment.voidedAt,
        created_at: shipment.createdAt,
        updated_at: shipment.updatedAt,
        items: shipment.items.map((item) => ({
          order_item_id: item.orderItemId,
          quantity: item.quantity,
        })),
        updates: shipment.updates.map((update) => ({
          id: update.id,
          status: update.status,
          actor_type: update.actorType,
          actor_id: update.actorId,
          source: update.source,
          occurred_at: update.occurredAt,
          note: update.note,
        })),
      })),
    })),
    legacy_shipping: {
      status: fulfillment.legacyShipping.status,
      updated_at: fulfillment.legacyShipping.updatedAt,
      to_country: fulfillment.legacyShipping.toCountry,
      from_countries: fulfillment.legacyShipping.fromCountries,
      estimated_delivery: fulfillment.legacyShipping.estimatedDelivery,
      tracking_number: fulfillment.legacyShipping.trackingNumber,
      carrier: fulfillment.legacyShipping.carrier,
      note: fulfillment.legacyShipping.note,
      shipped_at: fulfillment.legacyShipping.shippedAt,
      delivered_at: fulfillment.legacyShipping.deliveredAt,
    },
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
    sale_discount_minor: result.saleDiscountMinor,
    total_minor: result.totalMinor,
    ...(result.shippingAnchorAt
      ? { shipping_anchor_at: result.shippingAnchorAt }
      : {}),
    shops: result.shops.map((shop) => ({
      shop_id: shop.shopId,
      shop_name: shop.shopName,
      shop_slug: shop.shopSlug,
      subtotal_minor: shop.subtotalMinor,
      discount_minor: shop.discountMinor,
      sale_discount_minor: shop.saleDiscountMinor,
      shipping_minor: shop.shippingMinor,
      shipping_discount_minor: shop.shippingDiscountMinor,
      total_minor: shop.totalMinor,
      note: shop.note,
      promo_codes: shop.promoCodes,
      origin_countries: shop.originCountries,
      ...(shop.shipping ? { shipping: toPersistedShippingQuote(shop.shipping) } : {}),
      shipping_discounts: shop.shippingDiscounts.map(toPersistedShippingDiscount),
    })),
    expires_at: result.expiresAt,
    items: result.items.map((item) => ({
      inventory_id: item.inventoryId,
      title: item.title,
      image_url: item.imageUrl,
      image_reference: item.imageReference,
      quantity: item.quantity,
      sku: item.sku,
      selected_options: (item.selectedOptions ?? []).map((selection) => ({
        option_id: selection.optionId,
        option_name: selection.optionName,
        value_id: selection.valueId,
        value: selection.value,
      })),
      source_currency: item.sourceCurrency,
      unit_price_source_minor: item.unitPriceSourceMinor,
      line_total_source_minor: item.lineTotalSourceMinor,
      checkout_currency: item.checkoutCurrency,
      unit_price_checkout_minor: item.unitPriceCheckoutMinor,
      line_total_checkout_minor: item.lineTotalCheckoutMinor,
      original_amount_minor: item.originalAmountMinor,
      promo_discount_minor: item.promoDiscountMinor,
      currency: item.checkoutCurrency,
      source_type: item.sourceType,
      fx_rate: item.fxRate,
      fx_source: item.fxSource,
      fx_effective_at: item.fxEffectiveAt,
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
          selected_options: (product.selectedOptions ?? []).map((selection) => ({
            option_id: selection.optionId,
            option_name: selection.optionName,
            value_id: selection.valueId,
            value: selection.value,
          })),
          shipping: {},
        },
        inventory: {
          sku: product.sku,
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
      fulfillment: toCheckoutFulfillmentResponse(orderShop.fulfillment),
      canceled_at: orderShop.canceledAt,
      cancel_reason: orderShop.cancelReason,
      customer_support_note: orderShop.customerSupportNote,
      cancel_requested_at: orderShop.cancelRequestedAt,
      currency: orderShop.currency,
      subtotal_minor: orderShop.subtotalMinor,
      shipping_minor: orderShop.shippingMinor,
      ...toOrderShippingResponse(orderShop.shippingQuote),
      discount_minor: orderShop.discountMinor,
      total_minor: orderShop.totalMinor,
      note: orderShop.note,
      created_at: orderShop.createdAt,
    })),
  };
}
