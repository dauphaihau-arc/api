import type { FinanceRepositoryContext } from './finance-repository-context';

/** A shop's Seller Payable in one currency, projected from its Postings. */
export interface SellerPayablePosition {
  shopId: string;
  currency: string;
  availableMinor: number;
  notYetAvailableMinor: number;
}

export abstract class SellerPayableQueryRepository {
  abstract listByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<SellerPayablePosition[]>;
}
