import type { ConfigService } from '@nestjs/config';

/**
 * How long a shop must stay in a Settlement Currency before it may change it
 * again. The default is the platform's 90-day interval; the env override exists
 * so a local or test environment can exercise a second change without waiting.
 */
const DEFAULT_CHANGE_INTERVAL_DAYS = 90;

export interface SettlementCurrencyConfig {
  /** Days between two allowed Settlement Currency changes for one shop. */
  changeIntervalDays: number;
}

export const SETTLEMENT_CURRENCY_CONFIG = Symbol('SETTLEMENT_CURRENCY_CONFIG');

export function buildSettlementCurrencyConfig(
  configService: Pick<ConfigService, 'get'>,
): SettlementCurrencyConfig {
  return {
    changeIntervalDays: resolveChangeIntervalDays(
      configService.get<string>(
        'SETTLEMENT_CURRENCY_CHANGE_INTERVAL_DAYS',
        String(DEFAULT_CHANGE_INTERVAL_DAYS),
      ),
    ),
  };
}

function resolveChangeIntervalDays(value: string): number {
  const days = Number(value);

  if (!Number.isInteger(days) || days < 1) {
    throw new Error(
      `SETTLEMENT_CURRENCY_CHANGE_INTERVAL_DAYS must be a positive integer, received "${value}"`,
    );
  }

  return days;
}
