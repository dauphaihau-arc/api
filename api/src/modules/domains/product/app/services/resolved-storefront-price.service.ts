import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/config/storefront-pricing.config';
import { MARKETPLACE_MARKETS } from '~/config/marketplace.config';
import { FxRateService, type ExchangeRateSnapshot } from '~/modules/shared/currency/fx-rate.service';
import { RoundingPolicyService } from '~/modules/shared/currency/rounding-policy.service';
import type { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  getActiveBasePrice,
  getActiveMarketPrice,
} from '../../infra/persistence/mikro-orm/reads/variant-price-read';
import { isIndexedPricingSelection } from '../storefront-indexed-pricing';
import { StorefrontMarketContextService } from './storefront-market-context.service';

export interface ResolvedStorefrontPrice {
  amountMinor: number;
  originalAmountMinor?: number;
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
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly fxRateService: FxRateService,
    private readonly roundingPolicyService: RoundingPolicyService,
  ) {}

  async resolveForCurrentRequest(
    inventory: ProductInventoryEntity,
  ): Promise<ResolvedStorefrontPrice | undefined> {
    return this.resolve(
      inventory,
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
    const normalizedContext = normalizeContext(context);
    const shouldCache = normalizedContext
      && !isIndexedPricingSelection(this.storefrontPricingConfig, normalizedContext);
    const cacheKey = shouldCache
      ? buildResolvedPriceCacheKey(inventory.id, inventory.updatedAt, normalizedContext)
      : undefined;

    if (cacheKey) {
      const cached = await this.cacheManager.get<ResolvedStorefrontPrice>(cacheKey);

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
          originalAmountMinor: exactMarketPrice.originalAmountMinor,
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
          originalAmountMinor: marketPrice.originalAmountMinor,
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
          originalAmountMinor: basePrice.originalAmountMinor,
          currency: basePrice.currency,
          sourceCurrency: basePrice.currency,
          sourceUnitAmountMinor: basePrice.amountMinor,
          sourceType: 'base_native',
          sourcePriceId: basePrice.id,
        };
      }

      if (basePrice && !resolvedPrice) {
        const rate = await this.fxRateService.getLatestRate({
          fromCurrency: basePrice.currency,
          toCurrency: normalizedContext!.currency,
          at: normalizedContext?.at,
        });

        resolvedPrice = !rate
          ? {
            amountMinor: basePrice.amountMinor,
            originalAmountMinor: basePrice.originalAmountMinor,
            currency: basePrice.currency,
            sourceCurrency: basePrice.currency,
            sourceUnitAmountMinor: basePrice.amountMinor,
            sourceType: 'base_native',
            sourcePriceId: basePrice.id,
          }
          : convertBasePrice({
            amountMinor: basePrice.amountMinor,
            originalAmountMinor: basePrice.originalAmountMinor,
            sourcePriceId: basePrice.id,
            baseCurrency: basePrice.currency,
            targetCurrency: normalizedContext!.currency,
            roundingPolicyService: this.roundingPolicyService,
            rate,
          });
      }
    }

    if (cacheKey && resolvedPrice) {
      await this.cacheManager.set(
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

function convertBasePrice(input: {
  amountMinor: number;
  originalAmountMinor?: number;
  sourcePriceId: string;
  baseCurrency: string;
  targetCurrency: string;
  roundingPolicyService: RoundingPolicyService;
  rate: ExchangeRateSnapshot;
}): ResolvedStorefrontPrice {
  const numericRate = Number(input.rate.rate);
  const amountMajor = toMajorUnits(input.amountMinor, input.baseCurrency) * numericRate;
  const compareAtMajor = input.originalAmountMinor != null
    ? toMajorUnits(input.originalAmountMinor, input.baseCurrency) * numericRate
    : undefined;

  return {
    amountMinor: input.roundingPolicyService.toMinorUnits(amountMajor, input.targetCurrency),
    ...(compareAtMajor != null
      ? {
        originalAmountMinor: input.roundingPolicyService.toMinorUnits(
          compareAtMajor,
          input.targetCurrency,
        ),
      }
      : {}),
    currency: input.targetCurrency,
    sourceCurrency: input.baseCurrency,
    sourceUnitAmountMinor: input.amountMinor,
    sourceType: 'base_fx',
    sourcePriceId: input.sourcePriceId,
    fxRate: input.rate.rate,
    fxSource: input.rate.source,
    fxEffectiveAt: input.rate.effectiveAt,
    fxSourceTimestamp: input.rate.sourceTimestamp,
  };
}

function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / (currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1 : 100);
}
