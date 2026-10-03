import type { EntityRepository } from '@mikro-orm/postgresql';
import { toMinorUnits } from '../../../../platform/money/money';
import type {
  CheckoutQuoteItemSummary,
  PricedCartItem,
} from '../../../order/app/order.types';
import type { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { CheckoutQuoteEntity } from '../../infra/persistence/entities/checkout-quote.entity';
import type { CheckoutQuoteItemEntity } from '../../infra/persistence/entities/checkout-quote-item.entity';

export interface MappedCheckoutQuoteItem {
  entity: CheckoutQuoteItemEntity;
  summary: CheckoutQuoteItemSummary;
}

/**
 * Builds the persisted quote item row and the summary returned to the caller
 * from one priced cart item, in both currencies. The row and the summary are
 * produced together so the stored quote and the response cannot drift.
 */
export function createCheckoutQuoteItem(args: {
  repository: EntityRepository<CheckoutQuoteItemEntity>;
  quote: CheckoutQuoteEntity;
  inventory: ProductInventoryEntity;
  item: PricedCartItem;
  checkoutCurrency: string;
}): MappedCheckoutQuoteItem {
  const {
    repository,
    quote,
    inventory,
    item,
    checkoutCurrency,
  } = args;

  const unitPriceCheckoutMinor = item.unitPriceMinor ??
    toMinorUnits(item.effectiveUnitPrice, checkoutCurrency);

  const sourceCurrency = item.sourceCurrency ?? checkoutCurrency;

  const unitPriceSourceMinor = item.sourceUnitPriceMinor ??
    unitPriceCheckoutMinor;

  const originalAmountMinor = item.originalAmountMinor != null
    ? item.originalAmountMinor
    : item.effectiveUnitPrice < item.price
      ? toMinorUnits(item.price, checkoutCurrency)
      : undefined;

  const entity = repository.create({
    quote,
    inventory,
    title: item.title,
    imageUrl: item.imageUrl,
    imageReference: item.imageReference,
    sku: item.sku,
    selectedOptions: item.selectedOptions,
    quantity: item.quantity,
    sourceCurrency,
    unitPriceSourceMinor,
    lineTotalSourceMinor: unitPriceSourceMinor * item.quantity,
    checkoutCurrency,
    unitPriceCheckoutMinor,
    lineTotalCheckoutMinor: unitPriceCheckoutMinor * item.quantity,
    unitPriceMinor: unitPriceCheckoutMinor,
    ...(originalAmountMinor !== undefined ? { originalAmountMinor } : {}),
    lineTotalMinor: unitPriceCheckoutMinor * item.quantity,
    currency: checkoutCurrency,
    sourcePriceId: item.sourcePriceId,
    sourceType: item.sourceType,
    marketCode: item.marketCode,
    fxRate: item.fxRate,
    fxSource: item.fxSource,
    fxEffectiveAt: item.fxEffectiveAt,
    fxSourceTimestamp: item.fxSourceTimestamp,
  });

  return {
    entity,
    summary: {
      inventoryId: item.inventoryId,
      productId: item.productId,
      shopId: item.shopId,
      shopName: item.shopName,
      shopSlug: item.shopSlug,
      title: item.title,
      imageUrl: item.imageUrl,
      imageReference: entity.imageReference,
      quantity: item.quantity,
      sku: entity.sku,
      selectedOptions: entity.selectedOptions ?? [],
      sourceCurrency: entity.sourceCurrency,
      unitPriceSourceMinor: entity.unitPriceSourceMinor,
      lineTotalSourceMinor: entity.lineTotalSourceMinor,
      checkoutCurrency: entity.checkoutCurrency,
      unitPriceCheckoutMinor: entity.unitPriceCheckoutMinor,
      lineTotalCheckoutMinor: entity.lineTotalCheckoutMinor,
      unitPriceMinor: entity.unitPriceMinor,
      originalAmountMinor: entity.originalAmountMinor,
      lineTotalMinor: entity.lineTotalMinor,
      promoDiscountMinor: item.promoDiscountMinor ?? 0,
      currency: entity.currency,
      sourcePriceId: entity.sourcePriceId,
      sourceType: entity.sourceType,
      marketCode: entity.marketCode,
      fxRate: entity.fxRate,
      fxSource: entity.fxSource,
      fxEffectiveAt: entity.fxEffectiveAt,
      fxSourceTimestamp: entity.fxSourceTimestamp,
    },
  };
}
