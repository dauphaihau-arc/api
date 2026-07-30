import { Injectable } from '@nestjs/common';
import type {
  ListShopProductReviewsInput,
  ShopProductReviewListResult,
  ShopProductReviewSortOrder,
} from '../../product.types';
import { SellerProductReviewQueryRepository } from '../../ports/seller-product-review-query.repository';

export interface ListShopProductReviewsQuery {
  shopId: string;
  page: number;
  limit: number;
  status?: ListShopProductReviewsInput['status'];
  productId?: string;
  sort?: ShopProductReviewSortOrder;
}

@Injectable()
export class ListShopProductReviewsUseCase {
  constructor(
    private readonly sellerProductReviewQueryRepository: SellerProductReviewQueryRepository,
  ) {}

  execute(query: ListShopProductReviewsQuery): Promise<ShopProductReviewListResult> {
    return this.sellerProductReviewQueryRepository.listByShop({
      shopId: query.shopId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      productId: query.productId,
      sort: query.sort ?? 'newest',
    });
  }
}
