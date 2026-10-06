import { fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
import type { PromoOffer } from '../../../promotion/app/types/promotion.types';
import type { CheckoutShippingShopQuote } from '../../../shipping/app/shipping.types';
import type {
  PricedCartSummary,
  SelectedOptionSnapshot,
  ShippingDiscountProvenance,
} from '../order.types';
import type { LoadedCheckoutQuote } from './load-checkout-quote.service';

/**
 * The accepted shipping facts of one committed shop: the frozen estimate and
 * charge plus the discounts that were applied to it.
 */
export interface ResolvedCheckoutShipping {
  shipping: CheckoutShippingShopQuote;
  shippingDiscountMinor: number;
  shippingDiscounts: ShippingDiscountProvenance[];
}

/**
 * One committed order line, flattened so persistence never branches on whether
 * it came from an accepted quote or a freshly priced cart. All money is in
 * minor units of the checkout currency.
 */
export interface ResolvedCheckoutItem {
  inventoryId: string;
  productId: string;
  title: string;
  imageUrl?: string;
  imageReference?: string;
  sku?: string;
  quantity: number;
  selectedOptions?: SelectedOptionSnapshot[];
  priceMajor: number;
  unitPriceMinor: number;
  salePriceMajor?: number;
  originalAmountMinor?: number;
  lineTotalMinor: number;
  promoDiscountMinor: number;
  currency: string;
  sourcePriceId?: string;
  sourceType?: 'market_override' | 'base_native' | 'base_fx';
  marketCode?: string;
  fxRate?: string;
  fxSource?: string;
  fxEffectiveAt?: Date;
  fxSourceTimestamp?: Date;
}

/**
 * One committed shop's money and lines. `appliedOffers` is set only on the
 * freshly priced path, where the offers are already resolved; the quoted path
 * leaves it undefined and the codes are resolved during commitment.
 */
export interface ResolvedCheckoutShop {
  shopId: string;
  note?: string;
  originCountries: string[];
  marketCode?: string;
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  saleDiscountMinor: number;
  totalMinor: number;
  promoCodes: string[];
  appliedOffers?: PromoOffer[];
  shipping?: ResolvedCheckoutShipping;
  items: ResolvedCheckoutItem[];
}

export interface ResolvedCheckout {
  currency: string;
  totalMinor: number;
  shops: ResolvedCheckoutShop[];
}

/**
 * Maps an accepted quote or a freshly priced cart into the single shape that
 * order commitment writes from. An accepted quote is never re-derived: its
 * minor-unit money is carried through verbatim. A fresh cart is converted once
 * with the same rounding used everywhere else, so the persisted Order row, the
 * payment-provider charge, and the accepted quote can only ever agree.
 */
export function resolveCheckoutForCommit(args: {
  quote: LoadedCheckoutQuote | undefined;
  pricedCartSummary: PricedCartSummary;
  currency: string;
}): ResolvedCheckout {
  const { quote, pricedCartSummary: summary, currency } = args;

  if (quote) {
    return {
      currency,
      totalMinor: quote.totalMinor,
      shops: quote.shops.map((shop) => ({
        shopId: shop.shopId,
        note: shop.note,
        originCountries: shop.originCountries,
        marketCode: quote.marketCode ?? shop.items[0]?.marketCode,
        subtotalMinor: shop.subtotalMinor,
        shippingMinor: shop.shippingMinor,
        discountMinor: shop.discountMinor,
        saleDiscountMinor: shop.saleDiscountMinor,
        totalMinor: shop.subtotalMinor - shop.discountMinor + shop.shippingMinor,
        promoCodes: shop.promoCodes,
        shipping: shop.shipping
          ? {
            shipping: shop.shipping,
            shippingDiscountMinor: shop.shippingDiscountMinor,
            shippingDiscounts: shop.shippingDiscounts,
          }
          : undefined,
        items: shop.items.map((item) => ({
          inventoryId: item.inventoryId,
          productId: item.productId,
          title: item.title,
          imageUrl: item.imageUrl,
          imageReference: item.imageReference,
          sku: item.sku,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
          priceMajor: fromMinorUnits(
            item.originalAmountMinor ?? item.unitPriceCheckoutMinor,
            currency,
          ),
          unitPriceMinor: item.unitPriceCheckoutMinor,
          salePriceMajor: item.originalAmountMinor
            ? fromMinorUnits(item.unitPriceCheckoutMinor, currency)
            : undefined,
          originalAmountMinor: item.originalAmountMinor,
          lineTotalMinor: item.lineTotalCheckoutMinor,
          promoDiscountMinor: item.promoDiscountMinor,
          currency,
          sourcePriceId: item.sourcePriceId,
          sourceType: item.sourceType,
          marketCode: item.marketCode,
          fxRate: item.fxRate,
          fxSource: item.fxSource,
          fxEffectiveAt: item.fxEffectiveAt,
          fxSourceTimestamp: item.fxSourceTimestamp,
        })),
      })),
    };
  }

  return {
    currency,
    totalMinor: toMinorUnits(summary.totalPrice, currency),
    shops: summary.shops.map((shop) => {
      const subtotalMinor = toMinorUnits(shop.subtotal, currency);
      const shippingMinor = toMinorUnits(shop.totalShippingFee, currency);
      const discountMinor = toMinorUnits(shop.totalDiscount, currency);

      return {
        shopId: shop.shopId,
        note: shop.note,
        originCountries: shop.originCountries,
        marketCode: shop.items[0]?.marketCode,
        subtotalMinor,
        shippingMinor,
        discountMinor,
        saleDiscountMinor: toMinorUnits(shop.saleDiscount, currency),
        totalMinor: subtotalMinor - discountMinor + shippingMinor,
        promoCodes: shop.promoOffers.map((offer) => offer.code),
        appliedOffers: shop.promoOffers,
        shipping: shop.shipping
          ? {
            shipping: shop.shipping,
            shippingDiscountMinor: shop.shippingDiscountMinor ?? 0,
            shippingDiscounts: shop.shippingDiscounts ?? [],
          }
          : undefined,
        items: shop.items.map((item) => ({
          inventoryId: item.inventoryId,
          productId: item.productId,
          title: item.title,
          imageUrl: item.imageUrl,
          imageReference: item.imageReference,
          sku: item.sku,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
          priceMajor: item.price,
          unitPriceMinor: toMinorUnits(item.effectiveUnitPrice, currency),
          salePriceMajor: item.effectiveUnitPrice < item.price
            ? item.effectiveUnitPrice
            : item.salePrice,
          originalAmountMinor: item.effectiveUnitPrice < item.price
            ? toMinorUnits(item.price, currency)
            : undefined,
          lineTotalMinor: toMinorUnits(item.effectiveUnitPrice, currency) * item.quantity,
          promoDiscountMinor: item.promoDiscountMinor ?? 0,
          currency,
          sourcePriceId: item.sourcePriceId,
          sourceType: item.sourceType,
          marketCode: item.marketCode,
          fxRate: item.fxRate,
          fxSource: item.fxSource,
          fxEffectiveAt: item.fxEffectiveAt,
          fxSourceTimestamp: item.fxSourceTimestamp,
        })),
      };
    }),
  };
}
