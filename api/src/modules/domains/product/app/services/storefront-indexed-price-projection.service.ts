import { Inject, Injectable } from '@nestjs/common';
import { MARKETPLACE_MARKETS } from '~/config/marketplace.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/config/storefront-pricing.config';
import { FxRateService, type ExchangeRateSnapshot } from '~/modules/shared/currency/fx-rate.service';
import { RoundingPolicyService } from '~/modules/shared/currency/rounding-policy.service';
import type { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { VariantPriceEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import {
  getActiveBasePrice,
  getActiveMarketPrice,
} from '../../infra/persistence/mikro-orm/reads/variant-price-read';
import type {
  StorefrontIndexedInventoryPrice,
  StorefrontIndexedInventoryPricingMatrix,
  StorefrontIndexedPriceSummary,
  StorefrontIndexedPricingSummaryMatrix,
} from '../storefront-indexed-pricing';

@Injectable()
export class StorefrontIndexedPriceProjectionService {
  constructor(
    @Inject(STOREFRONT_PRICING_CONFIG)
    private readonly storefrontPricingConfig: StorefrontPricingConfig,
    private readonly fxRateService: FxRateService,
    private readonly roundingPolicyService: RoundingPolicyService,
  ) {}

  async projectProduct(product: ProductEntity): Promise<{
    summaryByMarket?: StorefrontIndexedPricingSummaryMatrix;
    inventoryPricingById: Map<string, {
      marketOverrides?: StorefrontIndexedInventoryPricingMatrix;
      resolvedByMarket?: StorefrontIndexedInventoryPricingMatrix;
    }>;
  }> {
    const rateCache = new Map<string, ExchangeRateSnapshot | null>();
    const inventoryPricingById = new Map<string, {
      marketOverrides?: StorefrontIndexedInventoryPricingMatrix;
      resolvedByMarket?: StorefrontIndexedInventoryPricingMatrix;
    }>();

    await Promise.all(
      product.inventoryRecords.getItems().map(async (inventory) => {
        const pricingByMarket = await this.projectInventory(inventory, rateCache);

        if (pricingByMarket.marketOverrides || pricingByMarket.resolvedByMarket) {
          inventoryPricingById.set(inventory.id, pricingByMarket);
        }
      }),
    );

    return {
      summaryByMarket: summarizeProductPricing(
        Array.from(inventoryPricingById.values())
          .map((pricing) => pricing.resolvedByMarket)
          .filter((pricing): pricing is StorefrontIndexedInventoryPricingMatrix => pricing != null),
      ),
      inventoryPricingById,
    };
  }

  private async projectInventory(
    inventory: ProductInventoryEntity,
    rateCache: Map<string, ExchangeRateSnapshot | null>,
  ): Promise<{
    marketOverrides?: StorefrontIndexedInventoryPricingMatrix;
    resolvedByMarket?: StorefrontIndexedInventoryPricingMatrix;
  }> {
    const resolvedByMarket: StorefrontIndexedInventoryPricingMatrix = {};
    const marketOverrides = getMarketOverrides(inventory.prices.getItems());

    for (const indexedPair of this.storefrontPricingConfig.indexedPricePairs) {
      const market = MARKETPLACE_MARKETS.find((entry) =>
        entry.enabled
        && entry.code === indexedPair.marketCode
        && entry.supportedCurrencies.includes(indexedPair.currency as never));

      if (!market) {
        continue;
      }

      const resolvedPrice = await this.resolveInventoryPrice(
        inventory,
        market.code,
        indexedPair.currency,
        rateCache,
      );

      if (!resolvedPrice) {
        continue;
      }

      if (isSameAsBasePrice(getActiveBasePrice(inventory), resolvedPrice)) {
        continue;
      }

      const pricingByCurrency = resolvedByMarket[market.code] ?? {};
      pricingByCurrency[indexedPair.currency] = resolvedPrice;
      resolvedByMarket[market.code] = pricingByCurrency;
    }

    return {
      ...(Object.keys(marketOverrides).length > 0 ? { marketOverrides } : {}),
      ...(Object.keys(resolvedByMarket).length > 0 ? { resolvedByMarket } : {}),
    };
  }

  private async resolveInventoryPrice(
    inventory: ProductInventoryEntity,
    marketCode: string,
    currency: string,
    rateCache: Map<string, ExchangeRateSnapshot | null>,
  ): Promise<StorefrontIndexedInventoryPrice | undefined> {
    const exactMarketPrice = getActiveMarketPrice(inventory, marketCode, currency);

    if (exactMarketPrice) {
      return {
        amountMinor: exactMarketPrice.amountMinor,
        ...(exactMarketPrice.originalAmountMinor != null
          ? { originalAmountMinor: exactMarketPrice.originalAmountMinor }
          : {}),
        currency: exactMarketPrice.currency,
      };
    }

    const basePrice = getActiveBasePrice(inventory);

    if (!basePrice) {
      return undefined;
    }

    if (basePrice.currency === currency) {
      return {
        amountMinor: basePrice.amountMinor,
        ...(basePrice.originalAmountMinor != null
          ? { originalAmountMinor: basePrice.originalAmountMinor }
          : {}),
        currency: basePrice.currency,
      };
    }

    const rate = await this.getCachedRate(
      basePrice.currency,
      currency,
      rateCache,
    );

    if (!rate) {
      return undefined;
    }

    return {
      amountMinor: this.roundingPolicyService.toMinorUnits(
        toMajorUnits(basePrice.amountMinor, basePrice.currency) * Number(rate.rate),
        currency,
      ),
      ...(basePrice.originalAmountMinor != null
        ? {
          originalAmountMinor: this.roundingPolicyService.toMinorUnits(
            toMajorUnits(basePrice.originalAmountMinor, basePrice.currency) * Number(rate.rate),
            currency,
          ),
        }
        : {}),
      currency,
    };
  }

  private async getCachedRate(
    fromCurrency: string,
    toCurrency: string,
    rateCache: Map<string, ExchangeRateSnapshot | null>,
  ): Promise<ExchangeRateSnapshot | null> {
    const cacheKey = `${fromCurrency}:${toCurrency}`;

    if (rateCache.has(cacheKey)) {
      return rateCache.get(cacheKey) ?? null;
    }

    const rate = await this.fxRateService.getLatestRate({
      fromCurrency,
      toCurrency,
    });

    rateCache.set(cacheKey, rate);

    return rate;
  }
}

function getMarketOverrides(
  prices: VariantPriceEntity[],
): StorefrontIndexedInventoryPricingMatrix {
  const marketOverrides: StorefrontIndexedInventoryPricingMatrix = {};

  prices
    .filter((price) => price.marketCode && !price.activeTo)
    .forEach((price) => {
      const marketCode = price.marketCode as string;
      const pricingByCurrency = marketOverrides[marketCode] ?? {};

      pricingByCurrency[price.currency] = {
        amountMinor: price.amountMinor,
        ...(price.originalAmountMinor != null
          ? { originalAmountMinor: price.originalAmountMinor }
          : {}),
        currency: price.currency,
      };
      marketOverrides[marketCode] = pricingByCurrency;
    });

  return marketOverrides;
}

function isSameAsBasePrice(
  basePrice: VariantPriceEntity | undefined,
  resolvedPrice: StorefrontIndexedInventoryPrice,
): boolean {
  if (!basePrice) {
    return false;
  }

  return basePrice.currency === resolvedPrice.currency
    && basePrice.amountMinor === resolvedPrice.amountMinor
    && basePrice.originalAmountMinor === resolvedPrice.originalAmountMinor;
}

function summarizeProductPricing(
  inventoryPricingMatrices: StorefrontIndexedInventoryPricingMatrix[],
): StorefrontIndexedPricingSummaryMatrix | undefined {
  const pricingByMarket: StorefrontIndexedPricingSummaryMatrix = {};

  inventoryPricingMatrices.forEach((matrix) => {
    Object.entries(matrix).forEach(([marketCode, pricingByCurrency]) => {
      const marketPricing = pricingByMarket[marketCode] ?? {};

      Object.entries(pricingByCurrency).forEach(([currency, pricing]) => {
        const current = marketPricing[currency];
        marketPricing[currency] = mergeSummaryPricing(current, pricing);
      });

      if (Object.keys(marketPricing).length > 0) {
        pricingByMarket[marketCode] = marketPricing;
      }
    });
  });

  return Object.keys(pricingByMarket).length > 0
    ? pricingByMarket
    : undefined;
}

function mergeSummaryPricing(
  current: StorefrontIndexedPriceSummary | undefined,
  pricing: StorefrontIndexedInventoryPrice,
): StorefrontIndexedPriceSummary {
  return {
    currency: pricing.currency,
    ...(pricing.amountMinor != null
      ? {
        minAmountMinor: current?.minAmountMinor != null
          ? Math.min(current.minAmountMinor, pricing.amountMinor)
          : pricing.amountMinor,
        maxAmountMinor: current?.maxAmountMinor != null
          ? Math.max(current.maxAmountMinor, pricing.amountMinor)
          : pricing.amountMinor,
      }
      : {}),
    ...(pricing.originalAmountMinor != null
      ? {
        originalMinAmountMinor: current?.originalMinAmountMinor != null
          ? Math.min(current.originalMinAmountMinor, pricing.originalAmountMinor)
          : pricing.originalAmountMinor,
        originalMaxAmountMinor: current?.originalMaxAmountMinor != null
          ? Math.max(current.originalMaxAmountMinor, pricing.originalAmountMinor)
          : pricing.originalAmountMinor,
      }
      : {}),
  };
}

function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / (currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1 : 100);
}
