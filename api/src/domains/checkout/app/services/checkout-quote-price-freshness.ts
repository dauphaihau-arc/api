import { toMinorUnits } from '~/platform/money/money';
import type {
  CheckoutQuoteItemSummary,
  PricedCartSummary,
} from '../../../order/app/order.types';
import type { LoadedCheckoutQuote } from '../../../order/app/services/load-checkout-quote.service';
import type { RefreshedCheckoutTotals } from '../../../order/app/errors/order-app.error';

/**
 * The money a quote's accepted totals are compared against, recomputed from the
 * current regular prices, active Sales, applied Promo Codes and Shipping
 * Charges. Quoting is the only place prices are frozen for acceptance; a cart
 * never reserves a Sale price, so commitment re-derives the totals and refuses
 * to charge something the buyer never accepted.
 *
 * Comparison is per shop, because that is the granularity the committed Order
 * money is derived from: each shop's subtotal, discount and Shipping Charge
 * must still equal what the buyer accepted.
 */
export function resolveRefreshedCheckoutTotals(
  quote: Pick<LoadedCheckoutQuote, 'checkoutCurrency' | 'shops'>,
  summary: PricedCartSummary,
): RefreshedCheckoutTotals | undefined {
  const currency = quote.checkoutCurrency;
  const shops = summary.shops.map((shop) => {
    const subtotalMinor = toMinorUnits(shop.subtotal, currency);
    const discountMinor = toMinorUnits(shop.totalDiscount, currency);
    const shippingMinor = toMinorUnits(shop.totalShippingFee, currency);

    return {
      shopId: shop.shopId,
      subtotalMinor,
      discountMinor,
      shippingMinor,
      totalMinor: subtotalMinor - discountMinor + shippingMinor,
    };
  });

  const refreshed: RefreshedCheckoutTotals = {
    checkoutCurrency: currency,
    subtotalMinor: shops.reduce((total, shop) => total + shop.subtotalMinor, 0),
    shippingMinor: shops.reduce((total, shop) => total + shop.shippingMinor, 0),
    discountMinor: shops.reduce((total, shop) => total + shop.discountMinor, 0),
    totalMinor: 0,
    shops,
  };
  refreshed.totalMinor = refreshed.subtotalMinor - refreshed.discountMinor + refreshed.shippingMinor;

  return matchesAcceptedQuote(quote, refreshed)
      && acceptedLinesStillMatch(quote, summary, currency)
    ? undefined
    : refreshed;
}

/**
 * Whether every accepted line still carries the same quantity and the same
 * committed unit price.
 *
 * Shop totals alone cannot prove this. One line can lose a Sale while another
 * gains an equal one, leaving subtotal, discount and Shipping Charge untouched
 * while both line prices change; the buyer would then be charged prices they
 * never accepted. So the accepted lines are compared directly, keyed by the
 * shop and inventory they were accepted for.
 */
function acceptedLinesStillMatch(
  quote: Pick<LoadedCheckoutQuote, 'shops'>,
  summary: PricedCartSummary,
  currency: string,
): boolean {
  const acceptedByKey = new Map<string, CheckoutQuoteItemSummary>();

  for (const shop of quote.shops) {
    for (const item of shop.items) {
      acceptedByKey.set(`${shop.shopId}:${item.inventoryId}`, item);
    }
  }

  let matched = 0;

  for (const shop of summary.shops) {
    for (const item of shop.items) {
      const accepted = acceptedByKey.get(`${shop.shopId}:${item.inventoryId}`);

      // Derived exactly as `createCheckoutQuoteItem` derives the committed
      // minor-unit price from a priced cart item.
      const refreshedUnitPriceMinor = item.unitPriceMinor ??
        toMinorUnits(item.effectiveUnitPrice, currency);

      if (
        !accepted
        || accepted.quantity !== item.quantity
        || accepted.unitPriceCheckoutMinor !== refreshedUnitPriceMinor
      ) {
        return false;
      }

      matched += 1;
    }
  }

  return matched === acceptedByKey.size;
}

function matchesAcceptedQuote(
  quote: Pick<LoadedCheckoutQuote, 'shops'>,
  refreshed: RefreshedCheckoutTotals,
): boolean {
  if (quote.shops.length !== refreshed.shops.length) {
    return false;
  }

  const refreshedByShopId = new Map(refreshed.shops.map((shop) => [shop.shopId, shop]));

  return quote.shops.every((shop) => {
    const current = refreshedByShopId.get(shop.shopId);

    return current != null
      && current.subtotalMinor === shop.subtotalMinor
      && current.discountMinor === shop.discountMinor
      && current.shippingMinor === shop.shippingMinor;
  });
}
