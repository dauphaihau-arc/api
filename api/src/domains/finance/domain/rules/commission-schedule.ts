import { MoneyDecimal, roundToMinorUnitIncrement } from '~/platform/money/money';
import { InvalidCommissionRateError } from '../errors/finance-domain.error';

/**
 * A shop's Platform Commission rule as of an effective-from instant. The rate is
 * an integer number of basis points of the discounted item subtotal
 * (`1500` is 15.00%), so a rate never crosses a contract as a decimal or a
 * binary float.
 */
export interface CommissionSchedule {
  shopId: string;
  effectiveFrom: Date;
  rateBasisPoints: number;
}

const MIN_RATE_BASIS_POINTS = 0;
const MAX_RATE_BASIS_POINTS = 10_000;
const BASIS_POINTS_PER_UNIT = 10_000;

/** Refuses a rate that cannot describe a commission share of a subtotal. */
export function assertValidCommissionRate(rateBasisPoints: number): void {
  const isValid =
    Number.isSafeInteger(rateBasisPoints)
    && rateBasisPoints >= MIN_RATE_BASIS_POINTS
    && rateBasisPoints <= MAX_RATE_BASIS_POINTS;

  if (!isValid) {
    throw new InvalidCommissionRateError(rateBasisPoints);
  }
}

/**
 * The Platform Commission on one Order's discounted item subtotal, in integer
 * minor units.
 *
 * The exact ratio is computed in decimal and then rounded once by the shared
 * money rounding implementation, at its `half_up` default — the same policy the
 * rest of the money code follows, so commission never encodes a rounding rule of
 * its own. Deriving the product as a binary float would let a float error decide
 * a half-minor-unit case.
 *
 * A rate of zero, or a subtotal the discount has already consumed, charges
 * nothing.
 */
export function calculateCommissionMinor(
  discountedItemSubtotalMinor: number,
  rateBasisPoints: number,
): number {
  assertValidCommissionRate(rateBasisPoints);

  if (discountedItemSubtotalMinor <= 0 || rateBasisPoints === 0) {
    return 0;
  }

  return roundToMinorUnitIncrement(
    new MoneyDecimal(discountedItemSubtotalMinor)
      .times(rateBasisPoints)
      .div(BASIS_POINTS_PER_UNIT),
  );
}

/**
 * The Commission Schedule that governed a Money Event: the latest schedule
 * whose effective-from is at or before the event's instant. Returns null when no
 * schedule was in force yet, which charges no commission.
 *
 * Resolution is by the event's own instant, never by when it is processed, so a
 * schedule recorded later cannot re-price an Order that was already paid.
 */
export function resolveEffectiveSchedule(
  schedules: readonly CommissionSchedule[],
  at: Date,
): CommissionSchedule | null {
  let effective: CommissionSchedule | null = null;

  for (const schedule of schedules) {
    if (schedule.effectiveFrom.getTime() > at.getTime()) {
      continue;
    }

    if (!effective || schedule.effectiveFrom.getTime() > effective.effectiveFrom.getTime()) {
      effective = schedule;
    }
  }

  return effective;
}
