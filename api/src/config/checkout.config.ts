import type { ConfigService } from '@nestjs/config';
import { toMinorUnits } from '~/common/utils/money';
import {
  MARKETPLACE_CURRENCIES,
  type MarketplaceCurrency
} from './marketplace.config';

const DEFAULT_MAX_ORDER_TOTALS_BY_CURRENCY_MAJOR: Record<MarketplaceCurrency, number> = {
  USD: 999999.99,
  AUD: 999999.99,
  BRL: 999999.99,
  CHF: 999999.99,
  CNY: 999999.99,
  CZK: 999999.99,
  DKK: 999999.99,
  EUR: 999999.99,
  GBP: 999999.99,
  CAD: 999999.99,
  HKD: 999999.99,
  HUF: 999999.99,
  IDR: 999999.99,
  ILS: 999999.99,
  INR: 999999.99,
  JPY: 100000000,
  KRW: 1000000,
  MAD: 999999.99,
  MXN: 999999.99,
  MYR: 999999.99,
  NOK: 999999.99,
  NZD: 999999.99,
  PHP: 999999.99,
  PLN: 999999.99,
  SEK: 999999.99,
  VND: 50000000,
  SGD: 999999.99,
  THB: 999999.99,
  TRY: 999999.99,
  TWD: 999999.99,
  ZAR: 999999.99,
};

export interface CheckoutConfig {
  maxOrderTotalByCurrencyMinor: Record<MarketplaceCurrency, number>;
}

export const CHECKOUT_CONFIG = Symbol('CHECKOUT_CONFIG');

export function buildCheckoutConfig(
  configService: Pick<ConfigService, 'get'>
): CheckoutConfig {
  const maxOrderTotalOverrides = parseCurrencyAmountMap(
    configService.get<string>('CHECKOUT_MAX_ORDER_TOTALS_BY_CURRENCY')
  );

  const maxOrderTotalByCurrencyMinor = Object.fromEntries(
    MARKETPLACE_CURRENCIES.map((currency) => [
      currency,
      toMinorUnits(
        maxOrderTotalOverrides[currency] ??
          DEFAULT_MAX_ORDER_TOTALS_BY_CURRENCY_MAJOR[currency],
        currency
      ),
    ])
  ) as Record<MarketplaceCurrency, number>;

  return {
    maxOrderTotalByCurrencyMinor,
  };
}

export function getMaxOrderTotalMinor(
  checkoutConfig: CheckoutConfig,
  currency: string
): number | undefined {
  return checkoutConfig.maxOrderTotalByCurrencyMinor[
    currency as MarketplaceCurrency
  ];
}

function parseCurrencyAmountMap(
  value: string | undefined
): Partial<Record<MarketplaceCurrency, number>> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [MarketplaceCurrency, number] =>
          MARKETPLACE_CURRENCIES.includes(entry[0] as MarketplaceCurrency)
          && typeof entry[1] === 'number'
          && Number.isFinite(entry[1])
      )
    ) as Partial<Record<MarketplaceCurrency, number>>;
  }
  catch {
    return {};
  }
}
