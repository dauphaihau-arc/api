import { Injectable } from '@nestjs/common';
import { ShopSettlementCurrencyUnresolvedError } from '../../errors/finance-app.error';
import {
  SellerPayableQueryRepository,
  type SellerPayablePosition,
} from '../../ports/seller-payable-query.repository';

/**
 * Reads a shop's Seller Payable: one position, in the shop's Settlement
 * Currency, projected from its Postings. A shop with no Postings yet reads as
 * zero in its Settlement Currency rather than as a missing position.
 */
@Injectable()
export class GetShopSellerPayableUseCase {
  constructor(
    private readonly sellerPayableQueryRepository: SellerPayableQueryRepository,
  ) {}

  async execute(shopId: string): Promise<SellerPayablePosition> {
    const position = await this.sellerPayableQueryRepository
      .findPositionByShopId(shopId);

    if (!position) {
      throw new ShopSettlementCurrencyUnresolvedError(shopId);
    }

    return position;
  }
}
