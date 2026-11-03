import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import {
  buildLabelChargedPostings,
  buildLabelRefundedPostings,
  labelChargeMoneyEventKey,
  labelRefundMoneyEventKey,
} from './label-money-event-postings';

const INPUT = { shopId: 'shop-1', currency: 'USD', amountMinor: 980 };

describe('label money event postings', () => {
  it('debits Seller Payable and credits Platform Clearing by the label price', () => {
    expect(buildLabelChargedPostings(INPUT)).toEqual([
      {
        account: {
          kind: LedgerAccountKind.SELLER_PAYABLE,
          currency: 'USD',
          shopId: 'shop-1',
        },
        amountMinor: -980,
      },
      {
        account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency: 'USD' },
        amountMinor: 980,
      },
    ]);
  });

  it('reverses every posting for a refund', () => {
    const charged = buildLabelChargedPostings(INPUT);

    expect(buildLabelRefundedPostings(INPUT)).toEqual(
      charged.map(posting => ({
        account: posting.account,
        amountMinor: -posting.amountMinor,
      })),
    );
  });

  it('keeps the charge and its reversal under distinct idempotency keys', () => {
    expect(labelChargeMoneyEventKey('lbl_1')).toBe('label.charge:lbl_1');
    expect(labelRefundMoneyEventKey('lbl_1')).toBe('label.refund:lbl_1');
  });
});
