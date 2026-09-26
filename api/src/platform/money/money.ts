import Decimal from 'decimal.js';
import { getCurrencyScale } from './currency-precision';

export type RoundingMode = 'half_up' | 'half_even' | 'up' | 'down';

/** Anything decimal.js can parse: string, number, or another Decimal. */
export type DecimalValue = Decimal.Value;

export interface MinorUnitRounding {
  mode?: RoundingMode;
  /** Rounding granularity in minor units; 1 is the currency quantum. */
  incrementMinor?: number;
}

/**
 * Decimal constructor used for every money calculation. Cloned rather than
 * configured through `Decimal.set` so money behaviour cannot be changed by
 * unrelated code touching the library global.
 */
export const MoneyDecimal = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP,
});

const DECIMAL_ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  half_up: Decimal.ROUND_HALF_UP,
  half_even: Decimal.ROUND_HALF_EVEN,
  up: Decimal.ROUND_UP,
  down: Decimal.ROUND_DOWN,
};

/** Decimal is immutable, so cached powers of ten are safe to share. */
const POWERS_OF_TEN: Decimal[] = [];

function tenPow(scale: number): Decimal {
  const cached = POWERS_OF_TEN[scale];

  if (cached) {
    return cached;
  }

  const factor = new MoneyDecimal(10).pow(scale);
  POWERS_OF_TEN[scale] = factor;

  return factor;
}

/**
 * Exact multiplication by the currency scale: positions a major-unit amount in
 * minor units without deciding anything. Use this when the scale comes from
 * somewhere other than the currency, e.g. an intermediate value that carries
 * more precision.
 *
 * Examples:
 * - `toMinorUnitsAtScale('19.99', 2)` -> `1999`
 * - `toMinorUnitsAtScale('1.005', 2)` -> `100.5` (positioned, not rounded)
 * - `toMinorUnitsAtScale('1234.5', 0)` -> `1234.5`
 * - `toMinorUnitsAtScale('0.001', 3)` -> `1`
 */
export function toMinorUnitsAtScale(amount: DecimalValue, scale: number): Decimal {
  return new MoneyDecimal(amount).times(tenPow(scale));
}

/**
 * The one rounding implementation. It rounds an amount that is already
 * positioned in minor units to an integer count, honouring the mode and the
 * granularity; it takes the decision and never looks one up.
 *
 * Examples (default mode `half_up`):
 * - `roundToMinorUnitIncrement('100.5')` -> `101`
 * - `roundToMinorUnitIncrement('100.4')` -> `100`
 * - `roundToMinorUnitIncrement('-100.5')` -> `-101` (halves away from zero)
 * - `roundToMinorUnitIncrement('100.5', { mode: 'half_even' })` -> `100`
 * - `roundToMinorUnitIncrement('102', { incrementMinor: 5 })` -> `100`
 * - `roundToMinorUnitIncrement('103', { incrementMinor: 5 })` -> `105`
 */
export function roundToMinorUnitIncrement(
  exactMinorUnits: DecimalValue,
  rounding?: MinorUnitRounding,
): number {
  const mode = DECIMAL_ROUNDING[rounding?.mode ?? 'half_up'];
  const incrementMinor = rounding?.incrementMinor ?? 1;
  const minorUnits = new MoneyDecimal(exactMinorUnits);

  const rounded = incrementMinor === 1
    ? minorUnits.toDecimalPlaces(0, mode)
    : minorUnits.div(incrementMinor).toDecimalPlaces(0, mode).times(incrementMinor);

  const value = rounded.toNumber();

  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `Rounded minor units ${rounded.toString()} are outside the safe integer range`,
    );
  }

  return value;
}

/**
 * Major-unit amount to minor units: currency scale, then the rounding decision,
 * then the integer count. The decimal amount is positioned exactly and rounded
 * once, so no binary-float representation error can reach a stored amount.
 *
 * Examples:
 * - `toMinorUnits(1.005, 'USD')` -> `101` (a float `Math.round` gives `100`)
 * - `toMinorUnits('19.995', 'USD')` -> `2000`
 * - `toMinorUnits(1234.5, 'JPY')` -> `1235` (JPY has no minor unit)
 * - `toMinorUnits(1.005, 'USD', { mode: 'half_even' })` -> `100`
 */
export function toMinorUnits(
  amount: DecimalValue,
  currency: string,
  rounding?: MinorUnitRounding,
): number {
  return roundToMinorUnitIncrement(
    toMinorUnitsAtScale(amount, getCurrencyScale(currency)),
    rounding,
  );
}

/** Major-unit amount as an exact decimal, for arithmetic that must not lose precision. */
export function fromMinorUnitsExact(amountMinor: number, currency: string): Decimal {
  return new MoneyDecimal(amountMinor).div(tenPow(getCurrencyScale(currency)));
}

export function fromMinorUnits(amountMinor: number, currency: string): number {
  return fromMinorUnitsExact(amountMinor, currency).toNumber();
}
