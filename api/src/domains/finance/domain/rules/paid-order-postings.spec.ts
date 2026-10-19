import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';
import {
  buildPaidOrderPostings,
  paidOrderMoneyEventKey,
} from './paid-order-postings';

const SETTLEMENT_CURRENCY = 'VND';

const BASE_FACTS = {
  shopId: 'shop-1',
  settlementCurrency: SETTLEMENT_CURRENCY,
  discountedItemSubtotalMinor: 240_000,
  shippingMinor: 12_000,
};

function amountFor(kind: LedgerAccountKind, postings: Posting[]) {
  const posting = postings.find((candidate) => candidate.account.kind === kind);
  if (!posting) throw new Error(`No posting for ${kind}`);
  return posting.amountMinor;
}

function accountFor(kind: LedgerAccountKind, postings: Posting[]) {
  const posting = postings.find((candidate) => candidate.account.kind === kind);
  if (!posting) throw new Error(`No posting for ${kind}`);
  return posting.account;
}

describe('paidOrderMoneyEventKey', () => {
  it('is the order.paid money event key for the order id', () => {
    expect(paidOrderMoneyEventKey('order-123')).toBe('order.paid:order-123');
  });
});

describe('buildPaidOrderPostings', () => {
  it('produces exactly a seller payable credit and a platform clearing debit', () => {
    const postings = buildPaidOrderPostings(BASE_FACTS);

    expect(postings.map((posting) => posting.account.kind)).toEqual([
      LedgerAccountKind.SELLER_PAYABLE,
      LedgerAccountKind.PLATFORM_CLEARING,
    ]);
  });

  it('sums to zero in the settlement currency', () => {
    const postings = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 36_000 });

    const sum = postings.reduce((total, posting) => total + posting.amountMinor, 0);

    expect(sum).toBe(0);
  });

  it('credits seller payable the discounted item subtotal plus the full shipping charge', () => {
    const postings = buildPaidOrderPostings(BASE_FACTS);

    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(252_000);
  });

  it('passes the whole shipping charge through to the payable', () => {
    const withoutShipping = buildPaidOrderPostings({ ...BASE_FACTS, shippingMinor: 0 });
    const withShipping = buildPaidOrderPostings(BASE_FACTS);

    expect(
      amountFor(LedgerAccountKind.SELLER_PAYABLE, withShipping) -
      amountFor(LedgerAccountKind.SELLER_PAYABLE, withoutShipping),
    ).toBe(12_000);
  });

  it('debits platform clearing the exact negation of what was collected', () => {
    const postings = buildPaidOrderPostings(BASE_FACTS);

    expect(amountFor(LedgerAccountKind.PLATFORM_CLEARING, postings)).toBe(-252_000);
  });

  it('charges no commission line when the rate is zero', () => {
    const postings = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 0 });

    expect(postings).toHaveLength(2);
    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(252_000);
  });

  it('deducts the commission from the seller payable and credits it to platform commission', () => {
    const postings = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 36_000 });

    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(216_000);
    expect(amountFor(LedgerAccountKind.PLATFORM_COMMISSION, postings)).toBe(36_000);
  });

  it('still passes the whole shipping charge through when commission is charged', () => {
    const charged = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 36_000 });
    const chargedWithoutShipping = buildPaidOrderPostings({
      ...BASE_FACTS,
      shippingMinor: 0,
      commissionMinor: 36_000,
    });

    expect(
      amountFor(LedgerAccountKind.SELLER_PAYABLE, charged) -
      amountFor(LedgerAccountKind.SELLER_PAYABLE, chargedWithoutShipping),
    ).toBe(12_000);
  });

  it('still debits platform clearing exactly what was collected', () => {
    const postings = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 36_000 });

    expect(amountFor(LedgerAccountKind.PLATFORM_CLEARING, postings)).toBe(-252_000);
  });

  it('denominates every account in the settlement currency', () => {
    const postings = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 36_000 });

    expect(postings.map((posting) => posting.account.currency)).toEqual([
      SETTLEMENT_CURRENCY,
      SETTLEMENT_CURRENCY,
      SETTLEMENT_CURRENCY,
    ]);
  });

  it('scopes the commission account to the platform and the payable account to the order shop', () => {
    const postings = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 36_000 });

    expect(accountFor(LedgerAccountKind.SELLER_PAYABLE, postings).shopId).toBe('shop-1');
    expect(accountFor(LedgerAccountKind.PLATFORM_COMMISSION, postings).shopId).toBeUndefined();
  });
});
