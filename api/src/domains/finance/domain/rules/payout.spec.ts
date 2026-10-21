import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import { PayoutAmountNotPositiveError } from '../errors/finance-domain.error';
import { assertBalancedJournalEntry } from '../value-objects/journal-entry';
import {
  allocatePayoutOrders,
  buildPaidPayoutPostings,
  isAutoPayoutDue,
  netPayableMinor,
  paidPayoutMoneyEventKey,
  payoutPeriodKey,
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
