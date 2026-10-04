import { fromMinorUnits } from '../../../../platform/money/money';
import { applyPercentageReduction } from '../../../../platform/pricing/percentage-reduction';
import type { CartItemSnapshot } from '../../../cart/app/cart.types';
import type { PricedCartItem } from '../../../order/app/order.types';
import type { SaleProjection } from '../../../promotion/app/ports/sale-projection.reader';

/**
 * Prices the selected cart items, applying the active Sale product-price
 * reduction per Product. Sales are the only auto-applied price reduction
 * source.
 */
export function priceItems(
  selectedItems: CartItemSnapshot[],
  salesByProductId: Map<string, SaleProjection>,
): Map<string, PricedCartItem[]> {
  const pricedItemsByShop = new Map<string, PricedCartItem[]>();

  for (const item of selectedItems) {
    const snapshotPrice = item.inventory.pricing;
    const pricingCurrency = snapshotPrice.currency;
    const baseUnitPriceMinor = snapshotPrice.originalAmountMinor ?? snapshotPrice.amountMinor;
    const baseUnitPrice = fromMinorUnits(baseUnitPriceMinor, pricingCurrency);

    const saleUnitPrice = snapshotPrice.originalAmountMinor != null
      ? fromMinorUnits(snapshotPrice.amountMinor, pricingCurrency)
      : undefined;

    let bestPriceMinor = snapshotPrice.amountMinor;
    let effectiveUnitPriceMinor = snapshotPrice.amountMinor;

    const sale = salesByProductId.get(item.inventory.productId);

    if (sale) {
      const discounted = applyPercentageReduction(
        baseUnitPriceMinor,
        pricingCurrency,
        sale.percentOff,
      );

      if (discounted && discounted.amountMinor < bestPriceMinor) {
        bestPriceMinor = discounted.amountMinor;
        effectiveUnitPriceMinor = discounted.amountMinor;
      }
    }

    const bestPrice = fromMinorUnits(bestPriceMinor, pricingCurrency);

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
    };
    const shopItems = pricedItemsByShop.get(pricedItem.shopId) ?? [];
    shopItems.push(pricedItem);
    pricedItemsByShop.set(pricedItem.shopId, shopItems);
  }

  return pricedItemsByShop;
}
