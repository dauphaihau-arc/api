import { resolveRefreshedCheckoutTotals } from './checkout-quote-price-freshness';
import { CartKind } from '../../../cart/domain/enums/cart-kind.enum';
import type {
  CheckoutQuoteItemSummary,
  PricedCartItem,
  PricedCartSummary,
} from '../../../order/app/order.types';
import type { LoadedCheckoutQuote } from '../../../order/app/services/load-checkout-quote.service';

function buildQuote(): Pick<LoadedCheckoutQuote, 'checkoutCurrency' | 'shops'> {
  return {
    checkoutCurrency: 'USD',
    shops: [{
      shopId: 'shop-1',
      shopPublicId: 'shop_public1',
      shopName: 'Shop 1',
      shopSlug: 'shop-1',
      subtotalMinor: 1800,
      discountMinor: 200,
      saleDiscountMinor: 0,
      shippingMinor: 1150,
      shippingDiscountMinor: 0,
      totalMinor: 2750,
      promoCodes: [],
      originCountries: [],
      shippingDiscounts: [],
      items: [],
    }],
  };
}

function buildSummary(overrides?: {
  subtotal?: number;
  totalDiscount?: number;
  saleDiscount?: number;
  totalShippingFee?: number;
}): PricedCartSummary {
  const subtotal = overrides?.subtotal ?? 18;
  const totalDiscount = overrides?.totalDiscount ?? 2;
  const saleDiscount = overrides?.saleDiscount ?? 0;
  const totalShippingFee = overrides?.totalShippingFee ?? 11.5;

  return {
    cart: {
      id: 'cart-1', userId: 'user-1', guestSessionId: null, kind: CartKind.ACTIVE, items: [],
    },
    currency: 'USD',
    shops: [{
      shopId: 'shop-1',
      shopPublicId: 'shop_public1',
      shopName: 'Shop 1',
      items: [],
      subtotal,
      totalDiscount,
      saleDiscount,
      totalShippingFee,
      total: subtotal - totalDiscount + totalShippingFee,
      promoOffers: [],
      originCountries: [],
    }],
    subtotalPrice: subtotal,
    totalDiscount,
    saleDiscount,
    subtotalAfterDiscount: subtotal - totalDiscount,
    totalShippingFee,
    totalPrice: subtotal - totalDiscount + totalShippingFee,
    totalSelectedQuantity: 1,
    totalQuantity: 1,
  };
}

describe('resolveRefreshedCheckoutTotals', () => {
  it('reports no change when the recomputed money still matches the accepted quote', () => {
    expect(resolveRefreshedCheckoutTotals(buildQuote(), buildSummary())).toBeUndefined();
  });

  it('reports the refreshed totals when a Sale stopped and the merchandise price rose', () => {
    const refreshed = resolveRefreshedCheckoutTotals(
      buildQuote(),
      buildSummary({ subtotal: 20, totalDiscount: 0 }),
    );

    expect(refreshed).toEqual({
      checkoutCurrency: 'USD',
      subtotalMinor: 2000,
      shippingMinor: 1150,
      discountMinor: 0,
      saleDiscountMinor: 0,
      totalMinor: 3150,
      shops: [{
        shopId: 'shop-1',
        shopPublicId: 'shop_public1',
        subtotalMinor: 2000,
        discountMinor: 0,
        saleDiscountMinor: 0,
        shippingMinor: 1150,
        totalMinor: 3150,
      }],
    });
  });

  it('treats a Shipping Charge change as a changed total', () => {
    const refreshed = resolveRefreshedCheckoutTotals(
      buildQuote(),
      buildSummary({ totalShippingFee: 15 }),
    );

    expect(refreshed?.shippingMinor).toBe(1500);
  });

  it('treats a different set of shops as a changed total', () => {
    const summary = buildSummary();

    const refreshed = resolveRefreshedCheckoutTotals(
      buildQuote(),
      { ...summary, shops: [...summary.shops, { ...summary.shops[0], shopId: 'shop-2' }] },
    );

    expect(refreshed?.shops.map((shop) => shop.shopId)).toEqual(['shop-1', 'shop-2']);
  });

  it('rejects an accepted quote whose line prices changed even when every shop total is unchanged', () => {
    const quote = buildQuote();
    quote.shops[0].items = [
      { inventoryId: 'inv-a', quantity: 1, unitPriceCheckoutMinor: 1000 },
      { inventoryId: 'inv-b', quantity: 1, unitPriceCheckoutMinor: 1000 },
    ] as CheckoutQuoteItemSummary[];

    const summary = buildSummary();
    summary.shops[0].items = [
      { inventoryId: 'inv-a', quantity: 1, unitPriceMinor: 1200 },
      { inventoryId: 'inv-b', quantity: 1, unitPriceMinor: 800 },
    ] as PricedCartItem[];

    expect(resolveRefreshedCheckoutTotals(quote, summary)).toBeDefined();
  });

  it('rejects an accepted quote whose eligible quantity changed for a line', () => {
    const quote = buildQuote();
    quote.shops[0].items = [
      { inventoryId: 'inv-a', quantity: 2, unitPriceCheckoutMinor: 1000 },
    ] as CheckoutQuoteItemSummary[];

    const summary = buildSummary();
    summary.shops[0].items = [
      { inventoryId: 'inv-a', quantity: 1, unitPriceMinor: 1000 },
    ] as PricedCartItem[];

    expect(resolveRefreshedCheckoutTotals(quote, summary)).toBeDefined();
  });

  it('reports no change when every accepted line still carries the same price and quantity', () => {
    const quote = buildQuote();
    quote.shops[0].items = [
      { inventoryId: 'inv-a', quantity: 2, unitPriceCheckoutMinor: 1000 },
    ] as CheckoutQuoteItemSummary[];

    const summary = buildSummary();
    summary.shops[0].items = [
      { inventoryId: 'inv-a', quantity: 2, unitPriceMinor: 1000 },
    ] as PricedCartItem[];

    expect(resolveRefreshedCheckoutTotals(quote, summary)).toBeUndefined();
  });
});
