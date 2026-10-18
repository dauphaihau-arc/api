import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';
import {
  buildPaidOrderPostings,
  paidOrderMoneyEventKey,
} from './paid-order-postings';

const BASE_FACTS = {
  shopId: 'shop-1',
  currency: 'USD',
  subtotalMinor: 10_000,
  discountMinor: 0,
  shippingMinor: 0,
};

function amountFor(kind: LedgerAccountKind, postings: Posting[]) {
  const posting = postings.find((candidate) => candidate.account.kind === kind);
  if (!posting) throw new Error(`No posting for ${kind}`);
  return posting.amountMinor;
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

  it('sums to zero in the order currency', () => {
    const postings = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
    });

    const sum = postings.reduce((total, posting) => total + posting.amountMinor, 0);

    expect(sum).toBe(0);
  });

  it('credits seller payable the discounted item subtotal plus the full shipping charge', () => {
    // 10_000 item subtotal - 1_500 discount + 500 shipping = 9_000 payable.
    const postings = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
    });

    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(9_000);
  });

  it('reduces the payable by the discount', () => {
    const withoutDiscount = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 0,
      shippingMinor: 500,
    });
    const withDiscount = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
    });

    expect(
      amountFor(LedgerAccountKind.SELLER_PAYABLE, withoutDiscount) -
        amountFor(LedgerAccountKind.SELLER_PAYABLE, withDiscount),
    ).toBe(1_500);
  });

  it('passes the whole shipping charge through to the payable', () => {
    const withoutShipping = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 0,
    });
    const withShipping = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
    });

    expect(
      amountFor(LedgerAccountKind.SELLER_PAYABLE, withShipping) -
        amountFor(LedgerAccountKind.SELLER_PAYABLE, withoutShipping),
    ).toBe(500);
  });

  it('debits platform clearing the exact negation of the seller payable credit', () => {
    const postings = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
    });

    expect(amountFor(LedgerAccountKind.PLATFORM_CLEARING, postings)).toBe(
      -amountFor(LedgerAccountKind.SELLER_PAYABLE, postings),
    );
  });

  it('charges no commission line when the rate is zero', () => {
    const postings = buildPaidOrderPostings({ ...BASE_FACTS, commissionMinor: 0 });

    expect(postings.map((posting) => posting.account.kind)).toEqual([
      LedgerAccountKind.SELLER_PAYABLE,
      LedgerAccountKind.PLATFORM_CLEARING,
    ]);
  });

  it('deducts the commission from the seller payable and credits it to platform commission', () => {
    // 10_000 - 1_500 discount = 8_500 items, + 500 shipping; 15% of 8_500 = 1_275.
    const postings = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
      commissionMinor: 1_275,
    });

    expect(amountFor(LedgerAccountKind.SELLER_PAYABLE, postings)).toBe(7_725);
    expect(amountFor(LedgerAccountKind.PLATFORM_COMMISSION, postings)).toBe(1_275);
  });

  it('still passes the whole shipping charge through when commission is charged', () => {
    const withoutShipping = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      shippingMinor: 0,
      commissionMinor: 1_275,
    });
    const withShipping = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      shippingMinor: 500,
      commissionMinor: 1_275,
    });

    expect(
      amountFor(LedgerAccountKind.SELLER_PAYABLE, withShipping) -
        amountFor(LedgerAccountKind.SELLER_PAYABLE, withoutShipping),
    ).toBe(500);
  });

  it('sums to zero once commission is charged', () => {
    const postings = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
      commissionMinor: 1_275,
    });

    expect(postings.reduce((total, posting) => total + posting.amountMinor, 0)).toBe(0);
  });

  it('still debits platform clearing exactly what was collected', () => {
    const postings = buildPaidOrderPostings({
      ...BASE_FACTS,
      subtotalMinor: 10_000,
      discountMinor: 1_500,
      shippingMinor: 500,
      commissionMinor: 1_275,
    });

    // Collected = item subtotal less discount, plus shipping, and is unchanged by commission.
    expect(amountFor(LedgerAccountKind.PLATFORM_CLEARING, postings)).toBe(-9_000);
  });

  it('scopes the commission account to the platform and the payable account to the order shop', () => {
    const postings = buildPaidOrderPostings({
      ...BASE_FACTS,
      commissionMinor: 1_275,
    });

    const commission = postings.find(
      (posting) => posting.account.kind === LedgerAccountKind.PLATFORM_COMMISSION,
    );

    expect(commission?.account).toEqual({
      kind: LedgerAccountKind.PLATFORM_COMMISSION,
      currency: 'USD',
    });
  });

  it('scopes the seller payable account to the order shop and the platform account to no shop', () => {
    const postings = buildPaidOrderPostings(BASE_FACTS);

    const payable = postings.find((posting) => posting.account.kind === LedgerAccountKind.SELLER_PAYABLE);
    const clearing = postings.find((posting) => posting.account.kind === LedgerAccountKind.PLATFORM_CLEARING);

    expect(payable?.account).toEqual({
      kind: LedgerAccountKind.SELLER_PAYABLE,
      currency: 'USD',
      shopId: 'shop-1',
    });
    expect(clearing?.account).toEqual({
      kind: LedgerAccountKind.PLATFORM_CLEARING,
      currency: 'USD',
    });
  });
});
