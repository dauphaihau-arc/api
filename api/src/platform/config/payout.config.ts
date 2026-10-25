import type { ConfigService } from '@nestjs/config';

/** The platform day an automatic Payout Run first becomes due each month. */
const DEFAULT_AUTO_PAYOUT_DAY_OF_MONTH = 15;

/**
 * A day past 28 would not exist in February, so the configured day is kept in
 * `1..28` and a run never silently skips a shorter month.
 */
const MIN_AUTO_PAYOUT_DAY_OF_MONTH = 1;
const MAX_AUTO_PAYOUT_DAY_OF_MONTH = 28;

/**
 * Attempts 2, 3, and 4 each wait one configured delay, so exactly three are
 * required. Mirrors the domain's `DEFAULT_PAYOUT_RETRY_DELAYS_MS`; kept here so
 * platform config does not depend on a domain rule.
 */
const DEFAULT_PAYOUT_RETRY_DELAYS_MS: readonly number[] = [
  60_000,
  300_000,
  900_000,
];
const PAYOUT_RETRY_DELAYS_COUNT = DEFAULT_PAYOUT_RETRY_DELAYS_MS.length;

/**
 * The currency the platform's own provider balance settles in. The platform is
 * paid into one balance, so a Payout converts its shop-currency amount into this
 * currency before the provider moves it.
 */
const DEFAULT_PAYOUT_PLATFORM_CURRENCY = 'USD';

const ISO_ALPHA_3_PATTERN = /^[A-Z]{3}$/;

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

  /**
   * The delays before attempts 2, 3, and 4, in milliseconds. Defaults to the
   * 1m/5m/15m schedule; `PAYOUT_RETRY_DELAYS_MS` shrinks it for local tests and
   * is refused in production.
   */
  retryDelaysMs: readonly number[];

  /**
   * The ISO 4217 currency the platform's provider balance settles in, from
   * `PAYOUT_PLATFORM_CURRENCY`. A Payout transfers in this currency; the shop's
   * Settlement Currency is what the ledger discharges.
   */
  platformCurrency: string;
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

  const rawRetryDelaysMs = configService.get<string>('PAYOUT_RETRY_DELAYS_MS');

  if (
    rawRetryDelaysMs !== undefined
    && configService.get<string>('NODE_ENV') === 'production'
  ) {
    throw new Error(
      'PAYOUT_RETRY_DELAYS_MS is a local/test-only switch and must not be set in production',
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
    retryDelaysMs: rawRetryDelaysMs === undefined
      ? DEFAULT_PAYOUT_RETRY_DELAYS_MS
      : resolvePayoutRetryDelaysMs(rawRetryDelaysMs),
    platformCurrency: resolvePlatformCurrency(
      configService.get<string>(
        'PAYOUT_PLATFORM_CURRENCY',
        DEFAULT_PAYOUT_PLATFORM_CURRENCY,
      ),
    ),
  };
}

/**
 * The platform currency is the currency the provider balance is held in, so a
 * typo would convert every Payout into a currency nobody holds. It is validated
 * as an ISO 4217 alpha-3 code here, before the first Payout, rather than left to
 * the provider to refuse.
 */
function resolvePlatformCurrency(value: string): string {
  const currency = value.trim().toUpperCase();

  if (!ISO_ALPHA_3_PATTERN.test(currency) || !isKnownIsoCurrency(currency)) {
    throw new Error(
      `PAYOUT_PLATFORM_CURRENCY must be an ISO 4217 alpha-3 currency code, received "${value}"`,
    );
  }

  return currency;
}

function isKnownIsoCurrency(currency: string): boolean {
  try {
    // `Intl` is the runtime's ISO 4217 table: an unknown code throws rather than
    // silently formatting. Money rounding has its own fixed table.
    new Intl.NumberFormat('en', { style: 'currency', currency });
    return true;
  }
  catch {
    return false;
  }
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

function resolvePayoutRetryDelaysMs(value: string): readonly number[] {
  const parts = value.split(',').map((part) => part.trim());
  const delays = parts.map((part) => Number(part));

  if (
    parts.length !== PAYOUT_RETRY_DELAYS_COUNT
    || delays.some((delay) => !Number.isInteger(delay) || delay <= 0)
  ) {
    throw new Error(
      `PAYOUT_RETRY_DELAYS_MS must be ${PAYOUT_RETRY_DELAYS_COUNT} comma-separated positive integers (milliseconds for attempts 2 to 4), received "${value}"`,
    );
  }

  return delays;
}
