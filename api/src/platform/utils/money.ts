const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

export function getMinorUnitScale(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * getMinorUnitScale(currency));
}

export function fromMinorUnits(amountMinor: number, currency: string): number {
  return amountMinor / getMinorUnitScale(currency);
}
