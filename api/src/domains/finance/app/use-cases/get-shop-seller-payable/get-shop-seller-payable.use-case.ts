import { Injectable } from '@nestjs/common';
import { ShopSettlementCurrencyUnresolvedError } from '../../errors/finance-app.error';
import {
  SellerPayableQueryRepository,
  type SellerPayableBalance,
} from '../../ports/seller-payable-query.repository';

/**
 * Reads a shop's Seller Payable: one balance, in the shop's Settlement
 * Currency, projected from its Postings. A shop with no Postings yet reads as
 * zero in its Settlement Currency rather than as a missing balance.
 */
@Injectable()
export class GetShopSellerPayableUseCase {
  constructor(
    private readonly sellerPayableQueryRepository: SellerPayableQueryRepository,
  ) {}

  async execute(shopId: string): Promise<SellerPayableBalance> {
    const balance = await this.sellerPayableQueryRepository
      .findBalanceByShopId(shopId);

    if (!balance) {
      throw new ShopSettlementCurrencyUnresolvedError(shopId);
    }

    return balance;
  }
}
