import { Inject, Injectable } from '@nestjs/common';
import { OptionalCacheService } from '~/integrations/cache/optional-cache.service';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/platform/config/storefront-pricing.config';
import { MARKETPLACE_MARKETS } from '~/platform/config/marketplace.config';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import {
  MoneyConversionService,
  type ConvertedMinorUnits,
} from '~/integrations/currency/money-conversion.service';
import type { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  getActiveBasePrice,
  getActiveMarketPrice,
} from '../../infra/persistence/mikro-orm/reads/variant-price-read';
import { isIndexedPricingSelection } from '../storefront-indexed-pricing';
import {
  StorefrontMarketContextService,
  type StorefrontMarketContext,
} from './storefront-market-context.service';

export interface ResolvedStorefrontPrice {
  amountMinor: number;
  currency: string;
  sourceCurrency: string;
  sourceUnitAmountMinor: number;
  sourceType: 'market_override' | 'base_native' | 'base_fx';
  sourcePriceId: string;
  marketCode?: string;
  fxRate?: string;
  fxSource?: string;
  fxEffectiveAt?: Date;
  fxSourceTimestamp?: Date;
}

@Injectable()
export class ResolvedStorefrontPriceService {
  constructor(
    @Inject(STOREFRONT_PRICING_CONFIG)
    private readonly storefrontPricingConfig: StorefrontPricingConfig,
    private readonly optionalCacheService: OptionalCacheService,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly moneyConversionService: MoneyConversionService,
  ) {}

  async resolveForCurrentRequest(
    inventory: ProductInventoryEntity,
  ): Promise<ResolvedStorefrontPrice | undefined> {
    return this.resolve(
      inventory,
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );
  }

  async resolveManyForCurrentRequest(
    inventories: ProductInventoryEntity[],
  ): Promise<Map<string, ResolvedStorefrontPrice | undefined>> {
    return this.resolveMany(
      inventories,
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );
  }

  async resolve(
    inventory: ProductInventoryEntity,
    context?: {
      marketCode?: string;
      currency?: string;
      at?: Date;
    },
  ): Promise<ResolvedStorefrontPrice | undefined> {
    return this.resolveNormalized(
      inventory,
      normalizeContext(context),
    );
  }

  async resolveMany(
    inventories: ProductInventoryEntity[],
    context?: StorefrontMarketContext,
  ): Promise<Map<string, ResolvedStorefrontPrice | undefined>> {
    const normalizedContext = normalizeContext(context);
    const rateCache: FxRateCache = new Map();
    const resolvedEntries = await Promise.all(
      inventories.map(async (inventory) => [
        inventory.id,
        await this.resolveNormalized(inventory, normalizedContext, rateCache),
      ] as const),
    );

    return new Map(resolvedEntries);
  }

  private async resolveNormalized(
    inventory: ProductInventoryEntity,
    normalizedContext?: ReturnType<typeof normalizeContext>,
    rateCache?: FxRateCache,
  ): Promise<ResolvedStorefrontPrice | undefined> {
    const shouldCache = normalizedContext
      && !isIndexedPricingSelection(this.storefrontPricingConfig, normalizedContext);
    const cacheKey = shouldCache
      ? buildResolvedPriceCacheKey(inventory.id, inventory.updatedAt, normalizedContext)
      : undefined;

    if (cacheKey) {
      const cached = await this.optionalCacheService.get<ResolvedStorefrontPrice>(
        'storefront.rare-price',
        cacheKey,
      );

      if (cached) {
        return cached;
      }
    }

    let resolvedPrice: ResolvedStorefrontPrice | undefined;

    if (normalizedContext?.marketCode && normalizedContext.currency) {
      const exactMarketPrice = getActiveMarketPrice(
        inventory,
        normalizedContext.marketCode,
        normalizedContext.currency,
      );

      if (exactMarketPrice) {
        resolvedPrice = {
          amountMinor: exactMarketPrice.amountMinor,
          currency: exactMarketPrice.currency,
          sourceCurrency: exactMarketPrice.currency,
          sourceUnitAmountMinor: exactMarketPrice.amountMinor,
          sourceType: 'market_override',
          sourcePriceId: exactMarketPrice.id,
          marketCode: exactMarketPrice.marketCode,
        };
      }
    }

    if (!resolvedPrice && normalizedContext?.marketCode && !normalizedContext.requestedCurrency) {
      const marketPrice = getActiveMarketPrice(inventory, normalizedContext.marketCode);

      if (marketPrice) {
        resolvedPrice = {
          amountMinor: marketPrice.amountMinor,
          currency: marketPrice.currency,
          sourceCurrency: marketPrice.currency,
          sourceUnitAmountMinor: marketPrice.amountMinor,
          sourceType: 'market_override',
          sourcePriceId: marketPrice.id,
          marketCode: marketPrice.marketCode,
        };
      }
    }

    if (!resolvedPrice) {
      const basePrice = getActiveBasePrice(inventory);

      if (!basePrice) {
        resolvedPrice = undefined;
      }

      if (basePrice && (!normalizedContext?.currency || normalizedContext.currency === basePrice.currency)) {
        resolvedPrice = {
          amountMinor: basePrice.amountMinor,
          currency: basePrice.currency,
          sourceCurrency: basePrice.currency,
          sourceUnitAmountMinor: basePrice.amountMinor,
          sourceType: 'base_native',
          sourcePriceId: basePrice.id,
        };
      }

      if (basePrice && !resolvedPrice) {
        const converted = await this.moneyConversionService.convert({
          amountMinor: basePrice.amountMinor,
          fromCurrency: basePrice.currency,
          toCurrency: normalizedContext!.currency,
          at: normalizedContext?.at,
          rateCache,
        });

        resolvedPrice = !converted
          ? {
            amountMinor: basePrice.amountMinor,
            currency: basePrice.currency,
            sourceCurrency: basePrice.currency,
            sourceUnitAmountMinor: basePrice.amountMinor,
            sourceType: 'base_native',
            sourcePriceId: basePrice.id,
          }
          : toResolvedBaseFxPrice({
            amountMinor: basePrice.amountMinor,
            sourcePriceId: basePrice.id,
            baseCurrency: basePrice.currency,
            targetCurrency: normalizedContext!.currency,
            converted,
          });
      }
    }

    if (cacheKey && resolvedPrice) {
      await this.optionalCacheService.set(
        'storefront.rare-price',
        cacheKey,
        resolvedPrice,
        this.storefrontPricingConfig.rarePriceCacheTtlMs,
      );
    }

    return resolvedPrice;
  }
}

function buildResolvedPriceCacheKey(
  inventoryId: string,
  inventoryUpdatedAt: Date,
  context: {
    marketCode: string;
    currency: string;
  },
): string {
  return [
    'storefront-price',
    inventoryId,
    inventoryUpdatedAt.toISOString(),
    context.marketCode,
    context.currency,
  ].join(':');
}

function normalizeContext(context?: {
  marketCode?: string;
  currency?: string;
  at?: Date;
}) {
  const marketCode = context?.marketCode?.trim();
  const market = marketCode
    ? MARKETPLACE_MARKETS.find((entry) => entry.code === marketCode && entry.enabled)
    : undefined;

  if (!market) {
    return undefined;
  }

  const requestedCurrency = context?.currency?.trim();
  const currency = requestedCurrency && market.supportedCurrencies.includes(requestedCurrency as never)
    ? requestedCurrency
    : market.defaultCurrency;

  return {
    marketCode: market.code,
    currency,
    requestedCurrency,
    at: context?.at,
  };
}

function toResolvedBaseFxPrice(input: {
  amountMinor: number;
  sourcePriceId: string;
  baseCurrency: string;
  targetCurrency: string;
  converted: ConvertedMinorUnits;
}): ResolvedStorefrontPrice {
  return {
    amountMinor: input.converted.amountMinor,
    currency: input.targetCurrency,
    sourceCurrency: input.baseCurrency,
    sourceUnitAmountMinor: input.amountMinor,
    sourceType: 'base_fx',
    sourcePriceId: input.sourcePriceId,
    fxRate: input.converted.fx?.rate,
    fxSource: input.converted.fx?.source,
    fxEffectiveAt: input.converted.fx?.effectiveAt,
    fxSourceTimestamp: input.converted.fx?.sourceTimestamp,
  };
}
