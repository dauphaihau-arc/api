import ms from 'ms';
import { MoneyDecimal } from '~/platform/money/money';

/**
 * Canonical text form of a Cutover Rate.
 *
 * A rate is not an amount: rounding it to a currency's minor unit would throw
 * away the precision the provider quoted (a USD→VND rate has six significant
 * digits below the unit) and make every later reversal cross at a rate nobody
 * quoted. The provider rate is therefore stored verbatim at its own precision,
 * normalized to plain decimal text so it reads the same in every language, and
 * the *amount* crossing it is rounded half-up to minor units by
 * `convertMinorUnitsAtRate`.
 */
export function normalizeCutoverRate(rate: string): string {
  const normalized = rate.trim();

  // decimal.js throws its own error for malformed input; the cutover rate is a
  // recorded money fact, so every invalid value is refused with one message.
  if (!/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized)) {
    throw new RangeError(`Cutover Rate must be a positive decimal, received "${rate}"`);
  }

  const value = new MoneyDecimal(normalized);

  if (value.lte(0)) {
    throw new RangeError(`Cutover Rate must be a positive decimal, received "${rate}"`);
  }

  return value.toFixed();
}

/**
 * The instant the shop's next Settlement Currency change becomes allowed: the
 * interval after the change that is currently open. A shop's opening history
 * row carries no `previous_currency`, so it is not a change and does not start
 * the clock; callers pass the open row's instant only when the row records one.
 */
export function nextSettlementCurrencyChangeAt(
  effectiveFrom: Date,
  intervalDays: number,
): Date {
  return new Date(effectiveFrom.getTime() + ms(`${intervalDays}d`));
}

/** Why the shop's state alone forbids a Settlement Currency change. */
export type SettlementCurrencyChangeBlockedReason =
  | 'balance_not_zero'
  | 'payout_pending'
  | 'change_too_soon';

export type SettlementCurrencyChangeEligibility =
  | { allowed: true }
  | { allowed: false; reason: SettlementCurrencyChangeBlockedReason };

/** The shop state a Settlement Currency change is evaluated against. */
export interface SettlementCurrencyChangeEligibilityInput {
  /** The shop's available Seller Payable, in either direction. */
  availableMinor: number;

  /** The shop's Seller Payable that is not yet available, in either direction. */
  notYetAvailableMinor: number;

  hasPendingPayout: boolean;

  /**
   * The open history row, when it exists. Only a row that records a
   * `previousCurrency` starts the interval; the opening row does not.
   */
  openPeriod: {
    effectiveFrom: Date;
    previousCurrency: string | null;
  } | null;

  /** The configured minimum interval between two changes, in days. */
  intervalDays: number;

  now: Date;
}

/**
 * Decides whether the shop's own state permits a Settlement Currency change,
 * before any target currency is considered. This is the one order both the
 * change command and the settings read use, so a refusal shown in the UI is
 * the refusal the command would return: balance first, then a pending Payout,
 * then the interval.
 *
 * Target-specific refusals — an unsupported or unchanged currency, or no rate
 * for a chosen target — are not shop state and stay with the command.
 */
export function evaluateSettlementCurrencyChange(
  input: SettlementCurrencyChangeEligibilityInput,
): SettlementCurrencyChangeEligibility {
  // Either part of the position blocks the change, and so does a negative one:
  // the shop must hold exactly nothing in the currency it retires.
  if (input.availableMinor !== 0 || input.notYetAvailableMinor !== 0) {
    return { allowed: false, reason: 'balance_not_zero' };
  }

  if (input.hasPendingPayout) {
    return { allowed: false, reason: 'payout_pending' };
  }

  if (input.openPeriod?.previousCurrency) {
    const nextChangeAllowedAt = nextSettlementCurrencyChangeAt(
      input.openPeriod.effectiveFrom,
      input.intervalDays,
    );

    if (input.now.getTime() < nextChangeAllowedAt.getTime()) {
      return { allowed: false, reason: 'change_too_soon' };
    }
  }

  return { allowed: true };
}
