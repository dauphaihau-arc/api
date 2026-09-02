import {
  MARKETPLACE_MARKETS,
  type MarketplaceCurrency,
} from '~/platform/config/marketplace.config';
import type { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';

export interface InventoryPricingSnapshot {
  amountMinor: number;
  currency: string;
}

export interface InventoryPricingContext {
  marketCode?: string;
  currency?: string;
}

export function getActiveBasePrice(
  inventory: ProductInventoryEntity,
): VariantPriceEntity | undefined {
  return inventory.prices
    .getItems()
    .find(
      (price) => !price.marketCode && !price.activeTo,
    );
}

export function getActiveMarketPrice(
  inventory: ProductInventoryEntity,
  marketCode: string,
  currency?: string,
): VariantPriceEntity | undefined {
  return inventory.prices
    .getItems()
    .find((price) => {
      if (!price.marketCode || price.activeTo) {
        return false;
      }

      if (price.marketCode !== marketCode) {
        return false;
      }

      return currency ? price.currency === currency : true;
    });
}

export function getInventoryPricingSnapshot(
  inventory: ProductInventoryEntity,
  context?: InventoryPricingContext,
): InventoryPricingSnapshot | undefined {
  const normalizedContext = normalizePricingContext(context);
  const activePrice = selectActivePrice(inventory, normalizedContext);

  if (!activePrice) {
    return undefined;
  }

  return {
    amountMinor: activePrice.amountMinor,
    currency: activePrice.currency,
  };
}

function selectActivePrice(
  inventory: ProductInventoryEntity,
  context?: Required<InventoryPricingContext>,
): VariantPriceEntity | undefined {
  const requestedCurrency = context?.currency;
  const marketCode = context?.marketCode;

  if (marketCode && requestedCurrency) {
    const exactMarketPrice = getActiveMarketPrice(inventory, marketCode, requestedCurrency);

    if (exactMarketPrice) {
      return exactMarketPrice;
    }
  }

  if (marketCode) {
    const marketPrice = getActiveMarketPrice(inventory, marketCode);

    if (marketPrice) {
      return marketPrice;
    }
  }

  const activeBasePrice = getActiveBasePrice(inventory);

  if (!activeBasePrice) {
    return undefined;
  }

  if (requestedCurrency && activeBasePrice.currency === requestedCurrency) {
    return activeBasePrice;
  }

  return activeBasePrice;
}

function normalizePricingContext(
  context?: InventoryPricingContext,
): Required<InventoryPricingContext> | undefined {
  const marketCode = context?.marketCode?.trim();

  if (!marketCode) {
    return undefined;
  }

  const market = MARKETPLACE_MARKETS.find((entry) => entry.code === marketCode && entry.enabled);

  if (!market) {
    return undefined;
  }

  const requestedCurrency = context?.currency?.trim() as MarketplaceCurrency | undefined;
  const currency = requestedCurrency && market.supportedCurrencies.includes(requestedCurrency)
    ? requestedCurrency
    : market.defaultCurrency;

  return {
    marketCode: market.code,
    currency,
  };
}
