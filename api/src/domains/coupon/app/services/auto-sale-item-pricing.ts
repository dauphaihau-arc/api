import { fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
import type { CartItemSnapshot } from '../../../cart/app/cart.types';
import type { PricedCartItem } from '../../../order/app/order.types';
import {
  couponAppliesToProduct,
  isCouponActive,
} from '../../../order/app/order.types';
import type { SaleProjection } from '../../../promotion/app/ports/sale-projection.reader';
import { CouponType } from '../../domain/enums/coupon-type.enum';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';

/**
 * Prices the selected cart items, applying the highest active product-price
 * reduction per Product. Two sources feed the same rule while the legacy
 * coupon path is being migrated: automatic-sale Coupons, and Sales from the
 * shared Promotion model. They never compound — the biggest percentage wins —
 * and the reduction always applies to the current regular price.
 *
 * Automatic sale Coupons are a pricing mechanism of their own: they are not
 * manual codes, so they never take part in the eligibility or slot rules.
 */
export function priceItems(
  selectedItems: CartItemSnapshot[],
  coupons: CouponEntity[],
  salesByProductId?: Map<string, SaleProjection>,
): Map<string, PricedCartItem[]> {
  const autoCouponsByShop = new Map<string, CouponEntity[]>();

  for (const coupon of coupons) {
    if (!coupon.isAutoSale) {
      continue;
    }
    const existing = autoCouponsByShop.get(coupon.shop.id) ?? [];
    existing.push(coupon);
    autoCouponsByShop.set(coupon.shop.id, existing);
  }

  const pricedItemsByShop = new Map<string, PricedCartItem[]>();

  for (const item of selectedItems) {
    const snapshotPrice = item.inventory.pricing;
    const pricingCurrency = snapshotPrice.currency;
    const baseUnitPriceMinor = snapshotPrice.originalAmountMinor ?? snapshotPrice.amountMinor;
    const baseUnitPrice = fromMinorUnits(baseUnitPriceMinor, pricingCurrency);

    const saleUnitPrice = snapshotPrice.originalAmountMinor != null
      ? fromMinorUnits(snapshotPrice.amountMinor, pricingCurrency)
      : undefined;

    const activeAutoCoupons = (autoCouponsByShop.get(item.inventory.shopId) ?? [])
      .filter((coupon) =>
        isCouponActive(coupon)
        && couponAppliesToProduct(coupon, item.inventory.productId),
      );

    let autoSaleCoupon: CouponEntity | undefined;
    let bestPrice = saleUnitPrice ?? baseUnitPrice;
    let effectiveUnitPriceMinor = snapshotPrice.amountMinor;

    for (const coupon of activeAutoCoupons) {
      if (coupon.type !== CouponType.PERCENTAGE) continue;
      const discounted = baseUnitPrice * (1 - (coupon.percentOff / 100));

      if (discounted < bestPrice) {
        bestPrice = discounted;
        autoSaleCoupon = coupon;
        effectiveUnitPriceMinor = toMinorUnits(discounted, pricingCurrency);
      }
    }

    const sale = salesByProductId?.get(item.inventory.productId);

    if (sale) {
      const discounted = baseUnitPrice * (1 - (sale.percentOff / 100));

      if (discounted < bestPrice) {
        bestPrice = discounted;
        autoSaleCoupon = undefined;
        effectiveUnitPriceMinor = toMinorUnits(discounted, pricingCurrency);
      }
    }

    const pricedItem: PricedCartItem = {
      cartItemId: item.id,
      inventoryId: item.inventory.inventoryId,
      productId: item.inventory.productId,
      shopId: item.inventory.shopId,
      shopName: item.inventory.shopName,
      shopSlug: item.inventory.shopSlug,
      title: item.inventory.title,
      imageUrl: item.inventory.imageUrl,
      imageReference: item.inventory.imageReference,
      quantity: item.quantity,
      sku: item.inventory.sku,
      currency: pricingCurrency,
      sourceCurrency: snapshotPrice.sourceCurrency,
      sourceUnitPriceMinor: snapshotPrice.sourceUnitAmountMinor,
      unitPriceMinor: effectiveUnitPriceMinor,
      originalAmountMinor: baseUnitPriceMinor,
      price: baseUnitPrice,
      salePrice: bestPrice < baseUnitPrice ? bestPrice : saleUnitPrice,
      baseUnitPrice,
      effectiveUnitPrice: bestPrice,
      sourcePriceId: snapshotPrice.sourcePriceId,
      sourceType: snapshotPrice.sourceType,
      marketCode: snapshotPrice.marketCode,
      fxRate: snapshotPrice.fxRate,
      fxSource: snapshotPrice.fxSource,
      fxEffectiveAt: snapshotPrice.fxEffectiveAt,
      fxSourceTimestamp: snapshotPrice.fxSourceTimestamp,
      autoSaleCoupon,
    };
    const shopItems = pricedItemsByShop.get(pricedItem.shopId) ?? [];
    shopItems.push(pricedItem);
    pricedItemsByShop.set(pricedItem.shopId, shopItems);
  }

  return pricedItemsByShop;
}
