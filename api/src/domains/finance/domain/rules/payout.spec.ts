import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import { PayoutAmountNotPositiveError } from '../errors/finance-domain.error';
import { assertBalancedJournalEntry } from '../value-objects/journal-entry';
import {
  allocatePayoutOrders,
  buildPaidPayoutPostings,
  buildPayoutFxPostings,
  isAutoPayoutDue,
  MAX_PAYOUT_ATTEMPTS,
  netPayableMinor,
  nextPayoutRunDate,
  paidPayoutMoneyEventKey,
  payoutFxMoneyEventKey,
  payoutPeriodKey,
  payoutRetryDelayMs,
  payoutRunDay,
} from './payout';

describe('payoutPeriodKey', () => {
  it('is the platform month in UTC', () => {
    expect(payoutPeriodKey(new Date('2026-10-01T00:00:00.000Z'))).toBe('2026-10');
    expect(payoutPeriodKey(new Date('2026-10-31T23:59:59.999Z'))).toBe('2026-10');
  });

  it('rolls over at the platform month boundary, not a local one', () => {
    expect(payoutPeriodKey(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-11');
  });
});

describe('isAutoPayoutDue', () => {
  it('is not due before the configured platform day', () => {
    expect(isAutoPayoutDue(new Date('2026-10-14T23:59:59.000Z'), 15)).toBe(false);
  });

  it('is due only on the configured platform day', () => {
    expect(isAutoPayoutDue(new Date('2026-10-15T00:00:00.000Z'), 15)).toBe(true);
    expect(isAutoPayoutDue(new Date('2026-10-16T00:00:00.000Z'), 15)).toBe(false);
    expect(isAutoPayoutDue(new Date('2026-10-20T12:00:00.000Z'), 15)).toBe(false);
  });

  it('follows the platform day, not the local day', () => {
    // 2026-10-15T00:30Z is still 2026-10-14 in Los Angeles.
    expect(isAutoPayoutDue(new Date('2026-10-15T00:30:00.000Z'), 15)).toBe(true);
  });
});

describe('payoutRunDay', () => {
  it('is the platform day, so the same instant is the same day for every shop', () => {
    expect(payoutRunDay(new Date('2026-10-19T00:00:00.000Z'))).toBe('2026-10-19');
    expect(payoutRunDay(new Date('2026-10-19T23:59:59.000Z'))).toBe('2026-10-19');
  });

  it('rolls over on the platform day boundary, not a local one', () => {
    // 2026-10-20T00:30Z is still 2026-10-19 in Los Angeles and already
    // 2026-10-20 in Ho Chi Minh City; the run follows neither.
    expect(payoutRunDay(new Date('2026-10-20T00:30:00.000Z'))).toBe('2026-10-20');
  });
});

describe('nextPayoutRunDate', () => {
  it('is today when the configured day is today', () => {
    expect(nextPayoutRunDate(new Date('2026-10-15T00:00:00.000Z'), 15))
      .toBe('2026-10-15');
    expect(nextPayoutRunDate(new Date('2026-10-15T23:59:59.999Z'), 15))
      .toBe('2026-10-15');
  });

  it('is this month when the configured day is still ahead', () => {
    expect(nextPayoutRunDate(new Date('2026-10-01T00:00:00.000Z'), 15))
      .toBe('2026-10-15');
    expect(nextPayoutRunDate(new Date('2026-10-14T23:59:59.999Z'), 15))
      .toBe('2026-10-15');
  });

  it('rolls to next month once the configured day has passed', () => {
    expect(nextPayoutRunDate(new Date('2026-10-16T00:00:00.000Z'), 15))
      .toBe('2026-11-15');
    expect(nextPayoutRunDate(new Date('2026-10-29T12:00:00.000Z'), 15))
      .toBe('2026-11-15');
  });

  it('rolls into the next year from December', () => {
    expect(nextPayoutRunDate(new Date('2026-12-20T00:00:00.000Z'), 15))
      .toBe('2027-01-15');
  });

  it('clamps a day past the month length to its last day', () => {
    expect(nextPayoutRunDate(new Date('2026-02-01T00:00:00.000Z'), 31))
      .toBe('2026-02-28');
    expect(nextPayoutRunDate(new Date('2026-02-28T10:00:00.000Z'), 31))
      .toBe('2026-02-28');
    expect(nextPayoutRunDate(new Date('2026-03-01T00:00:00.000Z'), 31))
      .toBe('2026-03-31');
    expect(nextPayoutRunDate(new Date('2026-04-15T00:00:00.000Z'), 31))
      .toBe('2026-04-30');
  });

  it('keeps a leap day when the target month has it', () => {
    expect(nextPayoutRunDate(new Date('2028-02-01T00:00:00.000Z'), 31))
      .toBe('2028-02-29');
  });
});

describe('paidPayoutMoneyEventKey', () => {
  it('identifies the payout that caused the entry', () => {
    expect(paidPayoutMoneyEventKey('9f2a1c5e-9b6d-4c3a-8f01-2d5e7a9c4b18'))
      .toBe('payout.paid:9f2a1c5e-9b6d-4c3a-8f01-2d5e7a9c4b18');
  });
});

describe('buildPaidPayoutPostings', () => {
  it('reduces the shop Seller Payable by exactly the amount paid and balances to zero', () => {
    const postings = buildPaidPayoutPostings({
      shopId: 'shop-1',
      currency: 'USD',
      amountMinor: 12_500,
    });

    expect(postings).toEqual([
      {
        account: {
          kind: LedgerAccountKind.SELLER_PAYABLE,
          currency: 'USD',
          shopId: 'shop-1',
        },
        amountMinor: -12_500,
      },
      {
        account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency: 'USD' },
        amountMinor: 12_500,
      },
    ]);

    expect(() => assertBalancedJournalEntry({
      moneyEventKey: paidPayoutMoneyEventKey('payout-1'),
      moneyEventKind: 'payout.paid',
      shopId: 'shop-1',
      currency: 'USD',
      occurredAt: new Date('2026-10-19T09:00:00.000Z'),
      postings,
    })).not.toThrow();
  });

  it('refuses to move a non-positive amount', () => {
    expect(() => buildPaidPayoutPostings({ shopId: 'shop-1', currency: 'USD', amountMinor: 0 }))
      .toThrow(PayoutAmountNotPositiveError);
    expect(() => buildPaidPayoutPostings({ shopId: 'shop-1', currency: 'USD', amountMinor: -1 }))
      .toThrow(PayoutAmountNotPositiveError);
  });
});

describe('payoutFxMoneyEventKey', () => {
  it('identifies the platform-currency entry of the payout that caused it', () => {
    expect(payoutFxMoneyEventKey('9f2a1c5e-9b6d-4c3a-8f01-2d5e7a9c4b18'))
      .toBe('payout.fx:9f2a1c5e-9b6d-4c3a-8f01-2d5e7a9c4b18');
  });
});

describe('buildPayoutFxPostings', () => {
  it('moves the transfer amount out of Platform Clearing into FX Position and balances to zero', () => {
    const postings = buildPayoutFxPostings({ currency: 'USD', amountMinor: 7_300 });

    expect(postings).toEqual([
      {
        account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency: 'USD' },
        amountMinor: -7_300,
      },
      {
        account: { kind: LedgerAccountKind.FX_POSITION, currency: 'USD' },
        amountMinor: 7_300,
      },
    ]);

    expect(() => assertBalancedJournalEntry({
      moneyEventKey: payoutFxMoneyEventKey('payout-1'),
      moneyEventKind: 'payout.fx',
      currency: 'USD',
      occurredAt: new Date('2026-10-19T09:00:00.000Z'),
      postings,
    })).not.toThrow();
  });

  it('is platform-level: neither posting names a shop', () => {
    for (const posting of buildPayoutFxPostings({ currency: 'USD', amountMinor: 7_300 })) {
      expect(posting.account).not.toHaveProperty('shopId');
    }
  });

  it('refuses the imbalanced entry a one-sided platform leg would make', () => {
    const postings = buildPayoutFxPostings({ currency: 'USD', amountMinor: 7_300 });

    // The double-entry invariant catches a leg whose counterpart is missing or
    // wrong: the platform-currency entry can never create or destroy money.
    expect(() => assertBalancedJournalEntry({
      moneyEventKey: payoutFxMoneyEventKey('payout-1'),
      moneyEventKind: 'payout.fx',
      currency: 'USD',
      occurredAt: new Date('2026-10-19T09:00:00.000Z'),
      postings: [postings[1]!],
    })).toThrow(/unbalanced/i);
  });

  it('refuses to move a non-positive amount', () => {
    expect(() => buildPayoutFxPostings({ currency: 'USD', amountMinor: 0 }))
      .toThrow(PayoutAmountNotPositiveError);
    expect(() => buildPayoutFxPostings({ currency: 'USD', amountMinor: -1 }))
      .toThrow(PayoutAmountNotPositiveError);
  });
});

describe('netPayableMinor', () => {
  it('pays only the available part when nothing is negative', () => {
    expect(netPayableMinor(12_500, 8_000)).toBe(12_500);
    expect(netPayableMinor(12_500, 0)).toBe(12_500);
  });

  it('nets a negative not-yet-available position before paying', () => {
    expect(netPayableMinor(12_500, -2_000)).toBe(10_500);
  });

  it('pays nothing when the shop owes more than it is owed', () => {
    expect(netPayableMinor(2_000, -2_500)).toBe(0);
    expect(netPayableMinor(0, -2_500)).toBe(0);
  });

  it('pays nothing while the available part itself is negative', () => {
    // A refund can overdraw availability while future Orders are still pending;
    // the debt stays until later availability offsets it.
    expect(netPayableMinor(-500, 3_000)).toBe(0);
  });
});

describe('allocatePayoutOrders', () => {
  it('discharges older Orders first and splits the last Order partially', () => {
    expect(allocatePayoutOrders(
      [
        { orderId: 'order-1', amountMinor: 4_000 },
        { orderId: 'order-2', amountMinor: 6_000 },
      ],
      7_500,
    )).toEqual([
      { orderId: 'order-1', amountMinor: 4_000 },
      { orderId: 'order-2', amountMinor: 3_500 },
    ]);
  });

  it('allocates nothing for a non-positive amount', () => {
    expect(allocatePayoutOrders(
      [{ orderId: 'order-1', amountMinor: 4_000 }],
      0,
    )).toEqual([]);
  });
});

describe('payoutRetryDelayMs', () => {
  it('backs off one, five, and fifteen minutes for attempts two to four', () => {
    expect(payoutRetryDelayMs(2)).toBe(60_000);
    expect(payoutRetryDelayMs(3)).toBe(300_000);
    expect(payoutRetryDelayMs(4)).toBe(900_000);
  });

  it('uses an override schedule by index, attempt 2 first', () => {
    const delays = [1_000, 2_000, 3_000];

    expect(payoutRetryDelayMs(2, delays)).toBe(1_000);
    expect(payoutRetryDelayMs(3, delays)).toBe(2_000);
    expect(payoutRetryDelayMs(4, delays)).toBe(3_000);
  });

  it('schedules nothing beyond the bounded attempt count', () => {
    // The first attempt is made inline, so a fourth failed attempt is terminal.
    expect(payoutRetryDelayMs(MAX_PAYOUT_ATTEMPTS + 1)).toBeNull();
    expect(payoutRetryDelayMs(1)).toBeNull();
  });

  it('applies the same bounds to an override schedule', () => {
    const delays = [1_000, 2_000, 3_000];

    expect(payoutRetryDelayMs(1, delays)).toBeNull();
    expect(payoutRetryDelayMs(MAX_PAYOUT_ATTEMPTS + 1, delays)).toBeNull();
  });

  it('gives one Payout four attempts in total', () => {
    expect(MAX_PAYOUT_ATTEMPTS).toBe(4);
  });
});
