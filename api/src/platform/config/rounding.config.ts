import type { RoundingMode } from '~/platform/money/money';

export type RoundingCalculationType = 'price' | 'tax' | 'discount' | 'shipping' | 'refund';

export interface RoundingPolicyConfig {
  defaultMode: RoundingMode;
  modeByCalculationType: Partial<Record<RoundingCalculationType, RoundingMode>>;
  /** Rounding granularity in minor units, keyed by currency, for cash-style rules. */
  incrementMinorByCurrency: Record<string, number>;
}

export const ROUNDING_POLICY_CONFIG = Symbol('ROUNDING_POLICY_CONFIG');

/**
 * `half_up` is the marketplace default: it is symmetric on negative amounts,
 * unlike `Math.round`, and it is the mode the platform used implicitly before
 * the policy became explicit. No per-type or per-currency overrides are required
 * today; the maps are the seam for adding them without touching callers.
 */
export const DEFAULT_ROUNDING_POLICY_CONFIG: RoundingPolicyConfig = {
  defaultMode: 'half_up',
  modeByCalculationType: {},
  incrementMinorByCurrency: {},
};
