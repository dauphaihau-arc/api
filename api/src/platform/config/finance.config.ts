import type { ConfigService } from '@nestjs/config';

/**
 * Where a money event's ledger consequences are booked:
 * - `outbox` records the `order.paid`, `order.delivered` or `order.refunded`
 *   outbox event and lets the finance worker book it, so a booking failure never
 *   blocks the producer request;
 * - `inline` books the journal entry inside the producer's own transaction, so a
 *   booking failure rolls the producer back and its caller retries.
 */
export type MoneyEventBooking = 'outbox' | 'inline';

const MONEY_EVENT_BOOKINGS: readonly MoneyEventBooking[] = ['outbox', 'inline'];

/** `outbox` is the safe default: local development has no finance worker yet. */
const DEFAULT_MONEY_EVENT_BOOKING: MoneyEventBooking = 'outbox';

export interface FinanceConfig {
  moneyEventBooking: MoneyEventBooking;
}

export const FINANCE_CONFIG = Symbol('FINANCE_CONFIG');

export function buildFinanceConfig(
  configService: Pick<ConfigService, 'get'>,
): FinanceConfig {
  return {
    moneyEventBooking: parseMoneyEventBooking(
      configService.get<string>(
        'FINANCE_MONEY_EVENT_BOOKING',
        DEFAULT_MONEY_EVENT_BOOKING,
      ),
    ),
  };
}

function parseMoneyEventBooking(value: string): MoneyEventBooking {
  const normalized = value.trim().toLowerCase();

  if (!MONEY_EVENT_BOOKINGS.includes(normalized as MoneyEventBooking)) {
    throw new Error(
      `FINANCE_MONEY_EVENT_BOOKING must be one of ${MONEY_EVENT_BOOKINGS.join(', ')}, received "${value}"`,
    );
  }

  return normalized as MoneyEventBooking;
}
