import type { ConfigService } from '@nestjs/config';

/** The platform day an automatic Payout Run first becomes due each month. */
const DEFAULT_AUTO_PAYOUT_DAY_OF_MONTH = 15;

/**
 * A day past 28 would not exist in February, so the configured day is kept in
 * `1..28` and a run never silently skips a shorter month.
 */
const MIN_AUTO_PAYOUT_DAY_OF_MONTH = 1;
const MAX_AUTO_PAYOUT_DAY_OF_MONTH = 28;

export interface PayoutConfig {
  /**
   * The platform day of month (UTC) on and after which the automatic Payout Run
   * pays shops that enabled it. The monthly claim makes it pay once per month.
   */
  autoPayoutDayOfMonth: number;

  /**
   * When true, a shop may withdraw manually more than once per platform month.
   * Off by default: a manual withdrawal is a monthly allowance.
   */
  manualWithdrawalUnlimited: boolean;

  /**
   * Local/E2E only: makes an automatic run due today and lets a shop enabled
   * today participate. The monthly claim still applies, so this can never pay a
   * shop twice in one month. Refused in production.
   */
  autoPayoutForceDue: boolean;
}

export const PAYOUT_CONFIG = Symbol('PAYOUT_CONFIG');

export function buildPayoutConfig(
  configService: Pick<ConfigService, 'get'>,
): PayoutConfig {
  const autoPayoutForceDue = ['true', '1'].includes(
    configService
      .get<string>('PAYOUT_AUTO_PAYOUT_FORCE', 'false')
      .trim()
      .toLowerCase(),
  );

  if (
    autoPayoutForceDue
    && configService.get<string>('NODE_ENV') === 'production'
  ) {
    throw new Error(
      'PAYOUT_AUTO_PAYOUT_FORCE is a local/test-only switch and must not be enabled in production',
    );
  }

  return {
    autoPayoutDayOfMonth: resolveAutoPayoutDayOfMonth(
      configService.get<string>(
        'PAYOUT_AUTO_DAY_OF_MONTH',
        String(DEFAULT_AUTO_PAYOUT_DAY_OF_MONTH),
      ),
    ),
    // Only an explicit true/1 opts in; a missing or misspelled value keeps the
    // safe default of a once-per-month withdrawal.
    manualWithdrawalUnlimited: ['true', '1'].includes(
      configService
        .get<string>('PAYOUT_MANUAL_WITHDRAWAL_UNLIMITED', 'false')
        .trim()
        .toLowerCase(),
    ),
    autoPayoutForceDue,
  };
}

function resolveAutoPayoutDayOfMonth(value: string): number {
  const day = Number(value);

  if (
    !Number.isInteger(day)
    || day < MIN_AUTO_PAYOUT_DAY_OF_MONTH
    || day > MAX_AUTO_PAYOUT_DAY_OF_MONTH
  ) {
    throw new Error(
      `PAYOUT_AUTO_DAY_OF_MONTH must be an integer between ${MIN_AUTO_PAYOUT_DAY_OF_MONTH} and ${MAX_AUTO_PAYOUT_DAY_OF_MONTH}, received "${value}"`,
    );
  }

  return day;
}
