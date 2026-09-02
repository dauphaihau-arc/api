import { Inject, Injectable } from '@nestjs/common';
import { MARKETPLACE_MARKETS } from '~/platform/config/marketplace.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/platform/config/storefront-pricing.config';
import { FxRateService, type ExchangeRateSnapshot } from '~/integrations/currency/fx-rate.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import {
  CouponAutoSaleProjectionReader,
  type ProductAutoSaleProjection,
} from '~/domains/coupon/app/ports/coupon-auto-sale-projection.reader';
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

interface ProductInventoryPricingProjection {
  basePrice?: StorefrontIndexedInventoryPrice;
  marketOverrides?: StorefrontIndexedInventoryPricingMatrix;
  resolvedByMarket?: StorefrontIndexedInventoryPricingMatrix;
}

@Injectable()
export class StorefrontIndexedPriceProjectionService {
  constructor(
    @Inject(STOREFRONT_PRICING_CONFIG)
    private readonly storefrontPricingConfig: StorefrontPricingConfig,
    private readonly fxRateService: FxRateService,
    private readonly roundingPolicyService: RoundingPolicyService,
    private readonly couponAutoSaleProjectionReader: CouponAutoSaleProjectionReader,
  ) {}

  async projectProduct(product: ProductEntity): Promise<{
    baseSummary?: StorefrontIndexedPriceSummary;
    summaryByMarket?: StorefrontIndexedPricingSummaryMatrix;
    inventoryPricingById: Map<string, ProductInventoryPricingProjection>;
  }> {
    const rateCache = new Map<string, ExchangeRateSnapshot | null>();
    const inventoryPricingById = new Map<string, ProductInventoryPricingProjection>();

    const autoSale = await this.couponAutoSaleProjectionReader.findBestAutoSaleForProduct({
      shopId: product.shop.id,
      productId: product.id,
    });

    await Promise.all(
      product.inventoryRecords.getItems().map(async (inventory) => {
        const pricingByMarket = await this.projectInventory(inventory, rateCache, autoSale);

        if (pricingByMarket.basePrice || pricingByMarket.marketOverrides || pricingByMarket.resolvedByMarket) {
          inventoryPricingById.set(inventory.id, pricingByMarket);
        }
      }),
    );

    return {
      baseSummary: summarizeInventoryPricing(
        Array.from(inventoryPricingById.values())
          .map((pricing) => pricing.basePrice)
          .filter((pricing): pricing is StorefrontIndexedInventoryPrice => pricing != null),
      ),
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
    autoSale?: ProductAutoSaleProjection,
  ): Promise<ProductInventoryPricingProjection> {
    const resolvedByMarket: StorefrontIndexedInventoryPricingMatrix = {};
    const basePrice = applyAutoSale(toBaseInventoryPrice(inventory), autoSale);
    const marketOverrides = getMarketOverrides(inventory.prices.getItems(), autoSale);

    for (const indexedPair of this.storefrontPricingConfig.indexedPricePairs) {
      const market = MARKETPLACE_MARKETS.find((entry) =>
        entry.enabled
        && entry.code === indexedPair.marketCode
        && entry.supportedCurrencies.includes(indexedPair.currency as never));

      if (!market) {
        continue;
      }

      const resolvedPrice = applyAutoSale(
        await this.resolveInventoryPrice(
          inventory,
          market.code,
          indexedPair.currency,
          rateCache,
        ),
        autoSale,
      );

      if (!resolvedPrice) {
        continue;
      }

      if (basePrice && isSameInventoryPrice(basePrice, resolvedPrice)) {
        continue;
      }

      const pricingByCurrency = resolvedByMarket[market.code] ?? {};
      pricingByCurrency[indexedPair.currency] = resolvedPrice;
      resolvedByMarket[market.code] = pricingByCurrency;
    }

    return {
      ...(basePrice ? { basePrice } : {}),
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
      return toInventoryPrice(exactMarketPrice);
    }

    const basePrice = getActiveBasePrice(inventory);

    if (!basePrice) {
      return undefined;
    }

    if (basePrice.currency === currency) {
      return toInventoryPrice(basePrice);
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


function toBaseInventoryPrice(
  inventory: ProductInventoryEntity,
): StorefrontIndexedInventoryPrice | undefined {
  const basePrice = getActiveBasePrice(inventory);
  return basePrice ? toInventoryPrice(basePrice) : undefined;
}

function toInventoryPrice(price: VariantPriceEntity): StorefrontIndexedInventoryPrice {
  return {
    amountMinor: price.amountMinor,
    ...(price.originalAmountMinor != null
      ? { originalAmountMinor: price.originalAmountMinor }
      : {}),
    currency: price.currency,
  };
}

function applyAutoSale(
  price: StorefrontIndexedInventoryPrice | undefined,
  autoSale?: ProductAutoSaleProjection,
): StorefrontIndexedInventoryPrice | undefined {
  if (!price || !autoSale || price.amountMinor == null) {
    return price;
  }

  const baseAmountMinor = price.originalAmountMinor ?? price.amountMinor;
  const discountedAmountMinor = Math.round(baseAmountMinor * (100 - autoSale.percentOff) / 100);

  if (discountedAmountMinor >= price.amountMinor) {
    return price;
  }

  return {
    ...price,
    amountMinor: discountedAmountMinor,
    originalAmountMinor: baseAmountMinor,
    autoSale: {
      couponId: autoSale.couponId,
      percentOff: autoSale.percentOff,
    },
  };
}

function getMarketOverrides(
  prices: VariantPriceEntity[],
  autoSale?: ProductAutoSaleProjection,
): StorefrontIndexedInventoryPricingMatrix {
  const marketOverrides: StorefrontIndexedInventoryPricingMatrix = {};

  prices
    .filter((price) => price.marketCode && !price.activeTo)
    .forEach((price) => {
      const marketCode = price.marketCode as string;
      const pricingByCurrency = marketOverrides[marketCode] ?? {};
      const resolvedPrice = applyAutoSale(toInventoryPrice(price), autoSale);

      if (resolvedPrice) {
        pricingByCurrency[price.currency] = resolvedPrice;
      }

      marketOverrides[marketCode] = pricingByCurrency;
    });

  return marketOverrides;
}

function isSameInventoryPrice(
  left: StorefrontIndexedInventoryPrice,
  right: StorefrontIndexedInventoryPrice,
): boolean {
  return left.currency === right.currency
    && left.amountMinor === right.amountMinor
    && left.originalAmountMinor === right.originalAmountMinor
    && left.autoSale?.couponId === right.autoSale?.couponId
    && left.autoSale?.percentOff === right.autoSale?.percentOff;
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

function summarizeInventoryPricing(
  inventoryPrices: StorefrontIndexedInventoryPrice[],
): StorefrontIndexedPriceSummary | undefined {
  return inventoryPrices.reduce<StorefrontIndexedPriceSummary | undefined>(
    (current, pricing) => mergeSummaryPricing(current, pricing),
    undefined,
  );
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
    ...(pricing.autoSale ? { autoSale: pricing.autoSale } : current?.autoSale ? { autoSale: current.autoSale } : {}),
  };
}

function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / (currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1 : 100);
}
