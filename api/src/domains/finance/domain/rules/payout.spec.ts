import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import { PayoutAmountNotPositiveError } from '../errors/finance-domain.error';
import { assertBalancedJournalEntry } from '../value-objects/journal-entry';
import {
  buildPaidPayoutPostings,
  paidPayoutMoneyEventKey,
  payoutRunDay,
} from './payout';

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
