import { Injectable } from '@nestjs/common';
import {
  SellerPayableQueryRepository,
  type SellerPayablePosition,
} from '../../ports/seller-payable-query.repository';

/** Reads a shop's Seller Payable positions, projected from its Postings. */
@Injectable()
export class GetShopSellerPayableUseCase {
  constructor(
    private readonly sellerPayableQueryRepository: SellerPayableQueryRepository,
  ) {}

  async execute(shopId: string): Promise<SellerPayablePosition[]> {
    return this.sellerPayableQueryRepository.listByShopId(shopId);
  }
}
