import { InvalidProviderFeeAmountError } from '../errors/finance-domain.error';
import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';

/** The money event kind every Provider Fee's Journal Entry records. */
export const PROVIDER_FEE_MONEY_EVENT_KIND = 'provider.fee';

/**
 * The Journal Entry identity of one Provider Fee. The fee's own id is the key,
 * so the entry can never be appended twice for the same recorded charge.
 */
export function providerFeeMoneyEventKey(feeId: string): string {
  return `${PROVIDER_FEE_MONEY_EVENT_KIND}:${feeId}`;
}

export interface ProviderFeeFacts {
  currency: string;
  /**
   * The signed fee in minor units: positive is a fee the provider charged,
   * negative reverses a previously charged fee.
   */
  amountMinor: number;
}

/**
 * Builds the Postings that record a Provider Fee: a positive fee is an expense
 * the platform paid, so it debits Platform Fee and credits Platform Clearing
 * the same amount. A negative fee is the provider reversing that charge, so the
 * same formula produces the opposite signs and reduces the Platform Fee
 * expense. The entry balances to zero and never touches Seller Payable.
 */
export function buildProviderFeePostings(facts: ProviderFeeFacts): Posting[] {
  if (!Number.isInteger(facts.amountMinor)) {
    throw new InvalidProviderFeeAmountError(
      `${facts.amountMinor} is not an integer number of minor units`,
    );
  }

  if (facts.amountMinor === 0) {
    throw new InvalidProviderFeeAmountError(
      'zero minor units does not describe money that moved',
    );
  }

  const currency = facts.currency;

  return [
    {
      account: { kind: LedgerAccountKind.PLATFORM_FEE, currency },
      amountMinor: -facts.amountMinor,
    },
    {
      account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency },
      amountMinor: facts.amountMinor,
    },
  ];
}
