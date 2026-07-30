import type {
  ListShopProductsInput,
  ProductDraftSummary,
  ShopProductListResult,
} from '../product.types';

export abstract class SellerProductQueryRepository {
  abstract findById(id: string): Promise<ProductDraftSummary | null>;

  abstract listByShop(
    input: ListShopProductsInput
  ): Promise<ShopProductListResult>;

  abstract findByShopIdAndSlug(
    shopId: string,
    slug: string
  ): Promise<ProductDraftSummary | null>;
}
