import type { LedgerAccountKind } from '../enums/ledger-account-kind.enum';

/**
 * A named position that Postings accumulate into: one kind in one currency, and
 * for a shop-owned account such as Seller Payable, one per shop.
 */
export interface LedgerAccount {
  kind: LedgerAccountKind;
  currency: string;
  shopId?: string;
}

/**
 * The storage identity of a Ledger Account. Platform accounts are one row per
 * kind and currency; shop accounts add the shop id.
 */
export function ledgerAccountKey(account: LedgerAccount): string {
  return account.shopId
    ? `${account.kind}:${account.currency}:${account.shopId}`
    : `${account.kind}:${account.currency}`;
}
