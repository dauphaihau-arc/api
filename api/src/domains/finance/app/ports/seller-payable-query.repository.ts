import type { FinanceRepositoryContext } from './finance-repository-context';

/** A shop's Seller Payable, in its Settlement Currency, projected from its Postings. */
export interface SellerPayablePosition {
  shopId: string;
  currency: string;
  availableMinor: number;
  notYetAvailableMinor: number;
}

export abstract class SellerPayableQueryRepository {
  /**
   * The shop's single Seller Payable position, in the shop's Settlement
   * Currency. Returns `null` only when the shop itself cannot be read; a shop
   * with no Postings yet resolves to zero in its Settlement Currency.
   */
  abstract findPositionByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<SellerPayablePosition | null>;
}
