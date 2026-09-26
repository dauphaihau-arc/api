import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_ROUNDING_POLICY_CONFIG,
  ROUNDING_POLICY_CONFIG,
  type RoundingCalculationType,
  type RoundingPolicyConfig,
} from '~/platform/config/rounding.config';
import { toMinorUnits as roundToMinorUnits, type DecimalValue } from '~/platform/money/money';

export interface RoundingContext {
  calculationType?: RoundingCalculationType;
}

/**
 * Owns *how* a calculated decimal becomes money: the rounding mode and the
 * rounding granularity. Unit scale (which currencies have zero decimals) and the
 * arithmetic live in `platform/money/money`; this service resolves the policy
 * for a calculation type and delegates the single rounding implementation.
 *
 * Rounding is per calculated amount, never per displayed total: line amounts are
 * rounded and totals are summed from the rounded minor units.
 */
@Injectable()
export class RoundingPolicyService {
  constructor(
    @Inject(ROUNDING_POLICY_CONFIG)
    private readonly config: RoundingPolicyConfig = DEFAULT_ROUNDING_POLICY_CONFIG,
  ) {}

  toMinorUnits(
    amountMajor: DecimalValue,
    currency: string,
    context?: RoundingContext,
  ): number {
    const configuredMode = context?.calculationType
      ? this.config.modeByCalculationType[context.calculationType]
      : undefined;

    return roundToMinorUnits(amountMajor, currency, {
      mode: configuredMode ?? this.config.defaultMode,
      incrementMinor: this.config.incrementMinorByCurrency[currency],
    });
  }
}
