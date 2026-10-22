import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';
import {
  buildOrderRefundPostings,
  computeProRataCommissionReversalMinor,
  convertMinorUnitsAtRate,
  orderRefundMoneyEventKey,
} from './order-refund-postings';

const SETTLEMENT_CURRENCY = 'USD';

function amountFor(kind: LedgerAccountKind, postings: Posting[]) {
  const posting = postings.find((candidate) => candidate.account.kind === kind);
  if (!posting) throw new Error(`No posting for ${kind}`);
  return posting.amountMinor;
}

describe('orderRefundMoneyEventKey', () => {
  it('identifies the refund fact inside the order', () => {
    expect(orderRefundMoneyEventKey('order-1', 'refund-2')).toBe(
      'order.refund:order-1:refund-2',
    );
  });
});

describe('computeProRataCommissionReversalMinor', () => {
  it('returns the refunded fraction of the frozen commission', () => {
    // 15% of a 10_000 minor order is 1_500; half the order refunded returns 750.
    expect(computeProRataCommissionReversalMinor(1_500, 5_000, 10_000)).toBe(750);
  });

  it('rounds half up once, at the minor-unit edge', () => {
    // 1_000 * 333 / 1_000 = 333 exactly; 1_000 * 1 / 3 = 333.33 -> 333.
    expect(computeProRataCommissionReversalMinor(1_000, 333, 1_000)).toBe(333);
    // 1_000 * 1 / 8 = 125; 1_000 * 1 / 16 = 62.5 -> 63 (half up).
    expect(computeProRataCommissionReversalMinor(1_000, 1, 16)).toBe(63);
  });

  it('returns the whole commission on a full refund and never more', () => {
    expect(computeProRataCommissionReversalMinor(1_500, 10_000, 10_000)).toBe(1_500);
    expect(computeProRataCommissionReversalMinor(1_500, 20_000, 10_000)).toBe(1_500);
  });

  it('returns nothing when there was no commission or nothing was refunded', () => {
    expect(computeProRataCommissionReversalMinor(0, 5_000, 10_000)).toBe(0);
    expect(computeProRataCommissionReversalMinor(1_500, 0, 10_000)).toBe(0);
    expect(computeProRataCommissionReversalMinor(1_500, 5_000, 0)).toBe(0);
  });
});

describe('convertMinorUnitsAtRate', () => {
  it('returns the same amount when the currencies match', () => {
    expect(convertMinorUnitsAtRate(5_000, 'USD', 'USD', '0.9')).toBe(5_000);
  });

  it('converts at the frozen rate verbatim, rounding once', () => {
    // 23_000 VND at 0.00004 USD per VND is $0.92 -> 92 minor units.
    expect(convertMinorUnitsAtRate(23_000, 'VND', 'USD', '0.00004')).toBe(92);
  });

  it('rounds half up at the destination minor-unit edge', () => {
    // $1.00 at 0.875 -> $0.875 -> 88 minor units.
    expect(convertMinorUnitsAtRate(100, 'USD', 'EUR', '0.875')).toBe(88);
  });
});

describe('buildOrderRefundPostings', () => {
  it('reduces Seller Payable by the refunded amount net of the reversed commission', () => {
    const postings = buildOrderRefundPostings({
      shopId: 'shop-1',
      settlementCurrency: SETTLEMENT_CURRENCY,
      refundedMinor: 5_000,
      commissionReversalMinor: 750,
    });

    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(-4_250);
    expect(amountFor(LedgerAccountKind.PLATFORM_COMMISSION, postings)).toBe(-750);
    expect(amountFor(LedgerAccountKind.PLATFORM_CLEARING, postings)).toBe(5_000);
    expect(postings.reduce((total, posting) => total + posting.amountMinor, 0)).toBe(0);
  });

  it('names the shop and the settlement currency on the Seller Payable posting', () => {
    const postings = buildOrderRefundPostings({
      shopId: 'shop-9',
      settlementCurrency: 'VND',
      refundedMinor: 100,
      commissionReversalMinor: 0,
    });
    const sellerPayable = postings.find(
      (posting) => posting.account.kind === LedgerAccountKind.SELLER_PAYABLE,
    );

    expect(sellerPayable?.account).toEqual({
      kind: LedgerAccountKind.SELLER_PAYABLE,
      currency: 'VND',
      shopId: 'shop-9',
    });
  });

  it('omits the commission line when nothing is reversed', () => {
    const postings = buildOrderRefundPostings({
      shopId: 'shop-1',
      settlementCurrency: SETTLEMENT_CURRENCY,
      refundedMinor: 5_000,
      commissionReversalMinor: 0,
    });

    expect(postings.map((posting) => posting.account.kind)).toEqual([
      LedgerAccountKind.SELLER_PAYABLE,
      LedgerAccountKind.PLATFORM_CLEARING,
    ]);
    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(-5_000);
  });

  it('never reverses more commission than the refund itself', () => {
    // A stale or double-computed reversal cannot turn the seller's debit into a
    // credit: the commission gives back at most what the buyer received.
    const postings = buildOrderRefundPostings({
      shopId: 'shop-1',
      settlementCurrency: SETTLEMENT_CURRENCY,
      refundedMinor: 1_000,
      commissionReversalMinor: 2_000,
    });

    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(0);
    expect(amountFor(LedgerAccountKind.PLATFORM_COMMISSION, postings)).toBe(-1_000);
    expect(postings.reduce((total, posting) => total + posting.amountMinor, 0)).toBe(0);
  });

  it('a full refund returns the seller contribution to zero', () => {
    // The paid entry credited 10_000 - 1_500 = 8_500 to Seller Payable.
    const paidCreditMinor = 8_500;
    const postings = buildOrderRefundPostings({
      shopId: 'shop-1',
      settlementCurrency: SETTLEMENT_CURRENCY,
      refundedMinor: 10_000,
      commissionReversalMinor: 1_500,
    });

    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(-paidCreditMinor);
    expect(paidCreditMinor + amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(0);
  });
});
