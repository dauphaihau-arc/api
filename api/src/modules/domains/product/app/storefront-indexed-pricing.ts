import { MARKETPLACE_MARKETS } from '~/config/marketplace.config';

export interface StorefrontIndexedPriceSummary {
  currency: string;
  minAmountMinor?: number;
  maxAmountMinor?: number;
  originalMinAmountMinor?: number;
  originalMaxAmountMinor?: number;
}

export interface StorefrontIndexedInventoryPrice {
  currency: string;
  amountMinor?: number;
  originalAmountMinor?: number;
}

export type StorefrontIndexedPricingSummaryMatrix = Record<
  string,
  Record<string, StorefrontIndexedPriceSummary>
>;

export type StorefrontIndexedInventoryPricingMatrix = Record<
  string,
  Record<string, StorefrontIndexedInventoryPrice>
>;

export interface StorefrontIndexedPricingSelection {
  marketCode: string;
  currency: string;
}

export interface StorefrontIndexedPricingConfigLike {
  indexedPricePairs: Array<{
    marketCode: string;
    currency: string;
  }>;
}

export function resolveIndexedPricingSelection(context?: {
  marketCode?: string;
  currency?: string;
}): StorefrontIndexedPricingSelection | undefined {
  const enabledMarkets = MARKETPLACE_MARKETS.filter((market) => market.enabled);
  const defaultMarket = enabledMarkets[0];

  if (!defaultMarket) {
    return undefined;
  }

  const market = enabledMarkets.find((entry) => entry.code === context?.marketCode?.trim()) ??
    defaultMarket;
  const requestedCurrency = context?.currency?.trim();
  const currency = requestedCurrency && market.supportedCurrencies.includes(requestedCurrency as never)
    ? requestedCurrency
    : market.defaultCurrency;

  return {
    marketCode: market.code,
    currency,
  };
}

export function getIndexedPricingFieldPath(
  selection: StorefrontIndexedPricingSelection,
  field: keyof StorefrontIndexedPriceSummary,
): string {
  return `pricingByMarket.${selection.marketCode}.${selection.currency}.${field}`;
}

export function isIndexedPricingSelection(
  config: StorefrontIndexedPricingConfigLike,
  selection: StorefrontIndexedPricingSelection | undefined,
): boolean {
  if (!selection) {
    return false;
  }

  return config.indexedPricePairs.some((entry) =>
    entry.marketCode === selection.marketCode && entry.currency === selection.currency);
}

export function getIndexedPriceSummary(
  matrix: StorefrontIndexedPricingSummaryMatrix | undefined,
  selection: StorefrontIndexedPricingSelection | undefined,
): StorefrontIndexedPriceSummary | undefined {
  if (!matrix || !selection) {
    return undefined;
  }

  return matrix[selection.marketCode]?.[selection.currency];
}

export function getIndexedInventoryPrice(
  matrix: StorefrontIndexedInventoryPricingMatrix | undefined,
  selection: StorefrontIndexedPricingSelection | undefined,
): StorefrontIndexedInventoryPrice | undefined {
  if (!matrix || !selection) {
    return undefined;
  }

  return matrix[selection.marketCode]?.[selection.currency];
}
