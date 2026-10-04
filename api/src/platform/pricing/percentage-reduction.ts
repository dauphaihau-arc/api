import { fromMinorUnitsExact, toMinorUnits } from '../money/money';

/**
 * Applies a percentage reduction to a regular price at the shared money
 * precision.
 *
 * The arithmetic stays decimal from the regular price through to the reduced
 * minor units. Deriving a major-unit float first and rounding that would let a
 * binary-float error decide the result: `10.50` less 5% is `997.5` minor units,
 * which half-up rounds to `998`, while the float product is
 * `9.9749999999999996` and rounds down to `997`.
 *
 * Returns undefined when the result is not a genuine reduction, so a caller
 * never shows a compare-at price it is not actually charging.
 */
export function applyPercentageReduction(
  amountMinor: number,
  currency: string,
  percentOff: number | undefined,
): { amountMinor: number; originalAmountMinor: number } | undefined {
  if (percentOff == null || percentOff <= 0) {
    return undefined;
  }

  const reducedAmountMinor = toMinorUnits(
    fromMinorUnitsExact(amountMinor, currency)
      .times(100 - percentOff)
      .div(100),
    currency,
  );

  if (reducedAmountMinor >= amountMinor) {
    return undefined;
  }

  return { amountMinor: reducedAmountMinor, originalAmountMinor: amountMinor };
}
