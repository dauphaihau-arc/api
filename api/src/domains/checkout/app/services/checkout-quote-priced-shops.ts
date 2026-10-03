import type { CheckoutQuoteShopSummary } from '../../../order/app/order.types';
import {
  parsePersistedShippingDiscount,
  parsePersistedShippingQuote,
  toPersistedShippingDiscount,
  toPersistedShippingQuote,
  type PersistedShippingDiscount,
  type PersistedShippingQuote,
} from '../checkout-shipping-snapshot.contract';

/**
 * Reads the persisted `checkout_quotes.priced_shops` JSON back into the quote
 * shop summaries. Transport uses snake_case; the accepted shipping facts inside
 * each shop are owned by `checkout-shipping-snapshot.contract`.
 */
export function parsePricedShops(
  pricedShops: Record<string, unknown>[],
): CheckoutQuoteShopSummary[] {
  return (pricedShops as Array<{
    shop_id: string;
    shop_name: string;
    shop_slug: string;
    subtotal_minor: number;
    discount_minor: number;
    sale_discount_minor?: number;
    shipping_minor: number;
    shipping_discount_minor?: number;
    total_minor: number;
    note?: string;
    promo_codes?: string[];
    origin_countries?: string[];
    shipping?: PersistedShippingQuote;
    shipping_discounts?: PersistedShippingDiscount[];
    items?: Array<{
      inventory_id: string;
      product_id: string;
      shop_id: string;
      shop_name: string;
      shop_slug: string;
      title: string;
      image_url?: string;
      image_reference?: string;
      quantity: number;
      sku?: string;
      source_currency?: string;
      unit_price_source_minor?: number;
      line_total_source_minor?: number;
      checkout_currency?: string;
      unit_price_checkout_minor?: number;
      line_total_checkout_minor?: number;
      unit_price_minor: number;
      original_amount_minor?: number;
      line_total_minor: number;
      promo_discount_minor?: number;
      currency: string;
      source_price_id?: string;
      source_type?: 'market_override' | 'base_native' | 'base_fx';
      market_code?: string;
      fx_rate?: string;
      fx_source?: string;
      fx_effective_at?: Date;
      fx_source_timestamp?: Date;
      selected_options?: Array<{
        optionId?: string;
        optionName: string;
        valueId?: string;
        value: string;
      }>;
    }>;
  }>).map((shop) => ({
    shopId: shop.shop_id,
    shopName: shop.shop_name,
    shopSlug: shop.shop_slug,
    subtotalMinor: shop.subtotal_minor,
    discountMinor: shop.discount_minor,
    saleDiscountMinor: shop.sale_discount_minor ?? 0,
    shippingMinor: shop.shipping_minor,
    shippingDiscountMinor: shop.shipping_discount_minor ?? 0,
    totalMinor: shop.total_minor,
    note: shop.note,
    promoCodes: shop.promo_codes ?? [],
    originCountries: shop.origin_countries ?? [],
    ...(shop.shipping ? { shipping: parsePersistedShippingQuote(shop.shipping) } : {}),
    shippingDiscounts: (shop.shipping_discounts ?? []).map(parsePersistedShippingDiscount),
    items: (shop.items ?? []).map((item) => ({
      inventoryId: item.inventory_id,
      productId: item.product_id,
      shopId: item.shop_id,
      shopName: item.shop_name,
      shopSlug: item.shop_slug,
      title: item.title,
      imageUrl: item.image_url,
      imageReference: item.image_reference,
      quantity: item.quantity,
      sku: item.sku,
      sourceCurrency: item.source_currency ?? item.currency,
      unitPriceSourceMinor: item.unit_price_source_minor ?? item.original_amount_minor ?? item.unit_price_minor,
      lineTotalSourceMinor: item.line_total_source_minor ??
        (item.unit_price_source_minor ?? item.original_amount_minor ?? item.unit_price_minor) * item.quantity,
      checkoutCurrency: item.checkout_currency ?? item.currency,
      unitPriceCheckoutMinor: item.unit_price_checkout_minor ?? item.unit_price_minor,
      lineTotalCheckoutMinor: item.line_total_checkout_minor ?? item.line_total_minor,
      unitPriceMinor: item.unit_price_minor,
      originalAmountMinor: item.original_amount_minor,
      lineTotalMinor: item.line_total_minor,
      promoDiscountMinor: item.promo_discount_minor ?? 0,
      currency: item.currency,
      sourcePriceId: item.source_price_id,
      sourceType: item.source_type,
      marketCode: item.market_code,
      fxRate: item.fx_rate,
      fxSource: item.fx_source,
      fxEffectiveAt: item.fx_effective_at,
      fxSourceTimestamp: item.fx_source_timestamp,
      selectedOptions: item.selected_options ?? [],
    })),
  }));
}

/**
 * Writes the quote shop summaries into the persisted
 * `checkout_quotes.priced_shops` JSON. The inverse of `parsePricedShops`; the
 * accepted shipping facts inside each shop are owned by
 * `checkout-shipping-snapshot.contract`.
 */
export function toPersistedPricedShops(
  shops: CheckoutQuoteShopSummary[],
): Record<string, unknown>[] {
  return shops.map((shop) => ({
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
    items: shop.items.map((item) => ({
      inventory_id: item.inventoryId,
      product_id: item.productId,
      shop_id: item.shopId,
      shop_name: item.shopName,
      shop_slug: item.shopSlug,
      title: item.title,
      image_url: item.imageUrl,
      image_reference: item.imageReference,
      quantity: item.quantity,
      sku: item.sku,
      source_currency: item.sourceCurrency,
      unit_price_source_minor: item.unitPriceSourceMinor,
      line_total_source_minor: item.lineTotalSourceMinor,
      checkout_currency: item.checkoutCurrency,
      unit_price_checkout_minor: item.unitPriceCheckoutMinor,
      line_total_checkout_minor: item.lineTotalCheckoutMinor,
      unit_price_minor: item.unitPriceMinor,
      original_amount_minor: item.originalAmountMinor,
      line_total_minor: item.lineTotalMinor,
      promo_discount_minor: item.promoDiscountMinor,
      currency: item.currency,
      source_price_id: item.sourcePriceId,
      source_type: item.sourceType,
      market_code: item.marketCode,
      fx_rate: item.fxRate,
      fx_source: item.fxSource,
      fx_effective_at: item.fxEffectiveAt,
      fx_source_timestamp: item.fxSourceTimestamp,
      selected_options: item.selectedOptions,
    })),
  }));
}
