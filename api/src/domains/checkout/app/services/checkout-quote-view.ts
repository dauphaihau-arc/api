import type { CheckoutQuoteEntity } from '../../infra/persistence/entities/checkout-quote.entity';
import type {
  CheckoutQuoteItemSummary,
  CheckoutQuoteResult,
  CheckoutQuoteShopSummary,
  PricedShopCart,
} from '../../../order/app/order.types';

/**
 * The money a shop contributes to a quote, in minor units of the checkout
 * currency, paired with the priced shop it came from.
 */
export interface PricedShopMoney {
  shop: PricedShopCart;
  subtotalMinor: number;
  discountMinor: number;
  saleDiscountMinor: number;
  shippingMinor: number;
  totalMinor: number;
}

/**
 * Builds the shop summaries a quote persists and returns, from the priced
 * shops and their quote item summaries. Pure: the caller owns persistence.
 */
export function buildQuoteShopSummaries(
  shopMoney: PricedShopMoney[],
  quoteItems: CheckoutQuoteItemSummary[],
): CheckoutQuoteShopSummary[] {
  return shopMoney.map((entry) => ({
    shopId: entry.shop.shopId,
    shopName: entry.shop.shopName,
    shopSlug: entry.shop.items[0]?.shopSlug ?? '',
    subtotalMinor: entry.subtotalMinor,
    discountMinor: entry.discountMinor,
    saleDiscountMinor: entry.saleDiscountMinor,
    shippingMinor: entry.shippingMinor,
    shippingDiscountMinor: entry.shop.shippingDiscountMinor ?? 0,
    totalMinor: entry.totalMinor,
    note: entry.shop.note,
    promoCodes: entry.shop.promoOffers.map((offer) => offer.code),
    originCountries: entry.shop.originCountries,
    shipping: entry.shop.shipping,
    shippingDiscounts: entry.shop.shippingDiscounts ?? [],
    items: quoteItems.filter((item) => item.shopId === entry.shop.shopId),
  }));
}

/**
 * Assembles the quote result from a persisted quote and its shops. `items` is
 * derived from `shops`, so quote creation, reuse, and later loads all return
 * the same shape.
 */
export function toCheckoutQuoteResult(args: {
  quote: CheckoutQuoteEntity;
  shops: CheckoutQuoteShopSummary[];
  presentmentCurrency?: string;
}): CheckoutQuoteResult {
  const { quote, shops, presentmentCurrency } = args;
  const shippingAnchorAt = shops.find((shop) => shop.shipping)?.shipping?.estimate.anchorAt;

  return {
    quoteId: quote.id,
    presentmentCurrency,
    checkoutCurrency: quote.checkoutCurrency,
    subtotalMinor: quote.subtotalMinor,
    shippingMinor: quote.shippingMinor,
    discountMinor: quote.discountMinor,
    saleDiscountMinor: quote.saleDiscountMinor,
    totalMinor: quote.totalMinor,
    ...(shippingAnchorAt ? { shippingAnchorAt } : {}),
    expiresAt: quote.expiresAt,
    shops,
    items: shops.flatMap((shop) => shop.items),
  };
}
