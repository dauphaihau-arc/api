import { Injectable } from '@nestjs/common';
import { MARKETPLACE_MARKETS } from '~/config/marketplace.config';
import { FxRateService, type ExchangeRateSnapshot } from '~/modules/shared/currency/fx-rate.service';
import { RoundingPolicyService } from '~/modules/shared/currency/rounding-policy.service';
import type { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  getActiveBasePrice,
  getActiveMarketPrice,
} from '../../infra/persistence/mikro-orm/reads/variant-price-read';
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

    if (normalizedContext?.marketCode && normalizedContext.currency) {
      const exactMarketPrice = getActiveMarketPrice(
        inventory,
        normalizedContext.marketCode,
        normalizedContext.currency,
      );

      if (exactMarketPrice) {
        return {
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

    if (normalizedContext?.marketCode && !normalizedContext.requestedCurrency) {
      const marketPrice = getActiveMarketPrice(inventory, normalizedContext.marketCode);

      if (marketPrice) {
        return {
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

    const basePrice = getActiveBasePrice(inventory);

    if (!basePrice) {
      return undefined;
    }

    if (!normalizedContext?.currency || normalizedContext.currency === basePrice.currency) {
      return {
        amountMinor: basePrice.amountMinor,
        originalAmountMinor: basePrice.originalAmountMinor,
        currency: basePrice.currency,
        sourceCurrency: basePrice.currency,
        sourceUnitAmountMinor: basePrice.amountMinor,
        sourceType: 'base_native',
        sourcePriceId: basePrice.id,
      };
    }

    const rate = await this.fxRateService.getLatestRate({
      fromCurrency: basePrice.currency,
      toCurrency: normalizedContext.currency,
      at: normalizedContext.at,
    });

    if (!rate) {
      return {
        amountMinor: basePrice.amountMinor,
        originalAmountMinor: basePrice.originalAmountMinor,
        currency: basePrice.currency,
        sourceCurrency: basePrice.currency,
        sourceUnitAmountMinor: basePrice.amountMinor,
        sourceType: 'base_native',
        sourcePriceId: basePrice.id,
      };
    }

    return convertBasePrice({
      amountMinor: basePrice.amountMinor,
      originalAmountMinor: basePrice.originalAmountMinor,
      sourcePriceId: basePrice.id,
      baseCurrency: basePrice.currency,
      targetCurrency: normalizedContext.currency,
      roundingPolicyService: this.roundingPolicyService,
      rate,
    });
  }
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
