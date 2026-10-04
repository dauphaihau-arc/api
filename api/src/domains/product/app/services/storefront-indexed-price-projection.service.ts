import { Inject, Injectable } from '@nestjs/common';
import { MARKETPLACE_MARKETS } from '~/platform/config/marketplace.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/platform/config/storefront-pricing.config';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { SaleProjectionReader } from '~/domains/promotion/app/ports/sale-projection.reader';
import { applyPercentageReduction } from '~/platform/pricing/percentage-reduction';
import {
  getActiveBasePrice,
  getActiveMarketPrice,
} from '../../infra/persistence/mikro-orm/reads/variant-price-read';
import type {
  StorefrontIndexedAutoSale,
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
    private readonly moneyConversionService: MoneyConversionService,
    private readonly saleProjectionReader: SaleProjectionReader,
  ) {}

  async projectProduct(product: ProductEntity): Promise<{
    baseSummary?: StorefrontIndexedPriceSummary;
    summaryByMarket?: StorefrontIndexedPricingSummaryMatrix;
    inventoryPricingById: Map<string, ProductInventoryPricingProjection>;
  }> {
    const rateCache: FxRateCache = new Map();
    const inventoryPricingById = new Map<string, ProductInventoryPricingProjection>();

    const salesByProductId = await this.saleProjectionReader.findBestSalesForProducts({
      targets: [{ shopId: product.shop.id, productId: product.id }],
    });
    const saleProjection = salesByProductId.get(product.id);
    const percentOff = saleProjection?.percentOff;
    let sale: StorefrontIndexedAutoSale | undefined;

    if (percentOff != null && saleProjection) {
      sale = { promotionId: saleProjection.promotionId, percentOff };
    }

    await Promise.all(
      product.inventoryRecords.getItems().map(async (inventory) => {
        const pricingByMarket = await this.projectInventory(inventory, rateCache, sale);

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
    rateCache: FxRateCache,
    autoSale?: StorefrontIndexedAutoSale,
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
    rateCache: FxRateCache,
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

    const converted = await this.moneyConversionService.convert({
      amountMinor: basePrice.amountMinor,
      fromCurrency: basePrice.currency,
      toCurrency: currency,
      rateCache,
    });

    if (!converted) {
      return undefined;
    }

    return {
      amountMinor: converted.amountMinor,
      currency,
    };
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
    currency: price.currency,
  };
}

function applyAutoSale(
  price: StorefrontIndexedInventoryPrice | undefined,
  autoSale?: StorefrontIndexedAutoSale,
): StorefrontIndexedInventoryPrice | undefined {
  if (!price || !autoSale || price.amountMinor == null) {
    return price;
  }

  const reduced = applyPercentageReduction(
    price.amountMinor,
    price.currency,
    autoSale.percentOff,
  );

  if (!reduced) {
    return price;
  }

  return {
    ...price,
    amountMinor: reduced.amountMinor,
    originalAmountMinor: reduced.originalAmountMinor,
    autoSale: {
      promotionId: autoSale.promotionId,
      percentOff: autoSale.percentOff,
    },
  };
}

function getMarketOverrides(
  prices: VariantPriceEntity[],
  autoSale?: StorefrontIndexedAutoSale,
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
    && left.autoSale?.promotionId === right.autoSale?.promotionId
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
