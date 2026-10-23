import ms from 'ms';
import {
  evaluateSettlementCurrencyChange,
  nextSettlementCurrencyChangeAt,
  normalizeCutoverRate,
  type SettlementCurrencyChangeEligibilityInput,
} from './settlement-currency';

describe('normalizeCutoverRate', () => {
  it('keeps the provider rate verbatim as plain decimal text', () => {
    expect(normalizeCutoverRate('0.0000420000')).toBe('0.000042');
    expect(normalizeCutoverRate('25500.0000000000')).toBe('25500');
    expect(normalizeCutoverRate('1.2345678901')).toBe('1.2345678901');
  });

  it('normalizes exponent notation to plain decimal text', () => {
    expect(normalizeCutoverRate('1e-7')).toBe('0.0000001');
  });

  it.each(['0', '-1', 'abc', '', 'Infinity', 'NaN'])(
    'rejects the invalid rate %p',
    (rate) => {
      expect(() => normalizeCutoverRate(rate)).toThrow(/Cutover Rate/);
    },
  );
});

describe('nextSettlementCurrencyChangeAt', () => {
  it('adds the configured interval to the last change instant', () => {
    const changedAt = new Date('2026-01-01T12:30:00.000Z');

    expect(nextSettlementCurrencyChangeAt(changedAt, 90).toISOString())
      .toBe('2026-04-01T12:30:00.000Z');
    expect(nextSettlementCurrencyChangeAt(changedAt, 1).toISOString())
      .toBe('2026-01-02T12:30:00.000Z');
  });
});

describe('evaluateSettlementCurrencyChange', () => {
  const now = new Date('2026-02-01T00:00:00.000Z');

  function input(
    overrides: Partial<SettlementCurrencyChangeEligibilityInput> = {},
  ): SettlementCurrencyChangeEligibilityInput {
    return {
      availableMinor: 0,
      notYetAvailableMinor: 0,
      hasPendingPayout: false,
      openPeriod: null,
      intervalDays: 90,
      now,
      ...overrides,
    };
  }

  function changedAt(daysAgo: number, nowDate = now): Date {
    return new Date(nowDate.getTime() - ms(`${daysAgo}d`));
  }

  it('allows a change when the shop holds nothing, has no pending Payout, and never changed', () => {
    expect(evaluateSettlementCurrencyChange(input())).toEqual({ allowed: true });
  });

  it('allows a change whose interval has fully elapsed', () => {
    expect(evaluateSettlementCurrencyChange(input({
      openPeriod: { effectiveFrom: changedAt(90), previousCurrency: 'USD' },
    }))).toEqual({ allowed: true });
  });

  it.each([
    ['positive available', 1, 0],
    ['negative available', -1, 0],
    ['positive not yet available', 0, 1],
    ['negative not yet available', 0, -1],
  ])('blocks a %s position', (_label, availableMinor, notYetAvailableMinor) => {
    expect(evaluateSettlementCurrencyChange(input({
      availableMinor,
      notYetAvailableMinor,
    }))).toEqual({ allowed: false, reason: 'balance_not_zero' });
  });

  it('blocks on a pending Payout', () => {
    expect(evaluateSettlementCurrencyChange(input({
      hasPendingPayout: true,
    }))).toEqual({ allowed: false, reason: 'payout_pending' });
  });

  it('blocks inside the interval and allows exactly at its edge', () => {
    const change = { effectiveFrom: changedAt(1), previousCurrency: 'USD' };

    expect(evaluateSettlementCurrencyChange(input({ openPeriod: change })))
      .toEqual({ allowed: false, reason: 'change_too_soon' });

    expect(evaluateSettlementCurrencyChange(input({
      openPeriod: {
        effectiveFrom: changedAt(90),
        previousCurrency: 'USD',
      },
    }))).toEqual({ allowed: true });
  });

  it('does not start the interval on the opening row', () => {
    expect(evaluateSettlementCurrencyChange(input({
      openPeriod: { effectiveFrom: changedAt(0), previousCurrency: null },
    }))).toEqual({ allowed: true });
  });

  it('reports the balance before a pending Payout, and both before the interval', () => {
    const tooSoon = { effectiveFrom: changedAt(1), previousCurrency: 'USD' };

    expect(evaluateSettlementCurrencyChange(input({
      availableMinor: 5,
      hasPendingPayout: true,
      openPeriod: tooSoon,
    }))).toEqual({ allowed: false, reason: 'balance_not_zero' });

    expect(evaluateSettlementCurrencyChange(input({
      hasPendingPayout: true,
      openPeriod: tooSoon,
    }))).toEqual({ allowed: false, reason: 'payout_pending' });
  });
});
