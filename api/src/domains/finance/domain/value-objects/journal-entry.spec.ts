import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import { UnbalancedJournalEntryError } from '../errors/finance-domain.error';
import {
  assertBalancedJournalEntry,
  type JournalEntry,
} from './journal-entry';

function buildEntry(amounts: [number, number]): JournalEntry {
  return {
    moneyEventKey: 'order.paid:order-1',
    moneyEventKind: 'order.paid',
    shopId: 'shop-1',
    currency: 'USD',
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    postings: [
      {
        account: {
          kind: LedgerAccountKind.SELLER_PAYABLE,
          currency: 'USD',
          shopId: 'shop-1',
        },
        amountMinor: amounts[0],
      },
      {
        account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency: 'USD' },
        amountMinor: amounts[1],
      },
    ],
  };
}

describe('assertBalancedJournalEntry', () => {
  it('accepts an entry whose postings sum to zero', () => {
    expect(() => assertBalancedJournalEntry(buildEntry([9_000, -9_000]))).not.toThrow();
  });

  it('rejects an entry that is off by one minor unit', () => {
    expect(() => assertBalancedJournalEntry(buildEntry([9_000, -8_999]))).toThrow(
      UnbalancedJournalEntryError,
    );
  });

  it('names the money event key and the offending sum when unbalanced', () => {
    expect(() => assertBalancedJournalEntry(buildEntry([9_000, -8_999]))).toThrow(
      /order\.paid:order-1/,
    );
    expect(() => assertBalancedJournalEntry(buildEntry([9_000, -8_999]))).toThrow(/1/);
  });
});
