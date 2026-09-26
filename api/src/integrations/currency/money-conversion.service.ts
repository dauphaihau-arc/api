import { Injectable } from '@nestjs/common';
import type { RoundingCalculationType } from '~/platform/config/rounding.config';
import { MoneyDecimal, fromMinorUnitsExact } from '~/platform/money/money';
import { FxRateService, type FxRateCache } from './fx-rate.service';
import { RoundingPolicyService } from './rounding-policy.service';

export interface ConvertedMinorUnits {
  amountMinor: number;
  /**
   * Rate provenance, present only when an exchange actually happened. A
   * same-currency conversion is the exact identity: no rate is looked up, no
   * rounding is applied, and no provenance is attached.
   */
  fx?: {
    rate: string;
    source: string;
    effectiveAt: Date;
    sourceTimestamp?: Date;
  };
}

export interface MoneyConversionInput {
  amountMinor: number;
  fromCurrency: string;
  toCurrency: string;
  at?: Date;
  calculationType?: RoundingCalculationType;
  rateCache?: FxRateCache;
}

/**
 * The one implementation of currency conversion for amounts held in minor
 * units. Catalog pricing and shipping pricing both convert through it so the
 * arithmetic, rounding policy, and rate provenance cannot drift between the
 * merchandise a buyer sees and the Shipping Charge they accept.
 *
 * Minor<->major scaling and the zero-decimal currency list live in
 * `platform/money/money`; this service invents neither a rate (it asks
 * `FxRateService`) nor a rounding rule (it asks `RoundingPolicyService`).
 */
@Injectable()
export class MoneyConversionService {
  constructor(
    private readonly fxRateService: FxRateService,
    private readonly roundingPolicyService: RoundingPolicyService,
  ) {}

  async convert(input: MoneyConversionInput): Promise<ConvertedMinorUnits | undefined> {
    if (input.fromCurrency === input.toCurrency) {
      return { amountMinor: input.amountMinor };
    }

    const rate = await this.fxRateService.getLatestRate(
      {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        at: input.at,
      },
      input.rateCache,
    );

    if (!rate) {
      return undefined;
    }

    const amountMajor = fromMinorUnitsExact(input.amountMinor, input.fromCurrency)
      .times(new MoneyDecimal(rate.rate));

    return {
      amountMinor: this.roundingPolicyService.toMinorUnits(
        amountMajor,
        input.toCurrency,
        { calculationType: input.calculationType },
      ),
      fx: {
        rate: rate.rate,
        source: rate.source,
        effectiveAt: rate.effectiveAt,
        sourceTimestamp: rate.sourceTimestamp,
      },
    };
  }
}
