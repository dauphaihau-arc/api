import type {
  ListShopProductReviewsInput,
  ShopProductReviewListResult,
} from '../product.types';

export abstract class SellerProductReviewQueryRepository {
  abstract listByShop(
    input: ListShopProductReviewsInput,
  ): Promise<ShopProductReviewListResult>;
}
