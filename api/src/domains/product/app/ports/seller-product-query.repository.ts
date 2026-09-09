import type {
  ListShopProductsInput,
  ProductDraftSummary,
  ProductMutationTarget,
  ShopProductListResult,
} from '../product.types';

export abstract class SellerProductQueryRepository {
  abstract findById(id: string): Promise<ProductDraftSummary | null>;

  abstract findMutationTargetById(id: string): Promise<ProductMutationTarget | null>;

  abstract listByShop(
    input: ListShopProductsInput
  ): Promise<ShopProductListResult>;

  abstract findByShopIdAndSlug(
    shopId: string,
    slug: string
  ): Promise<ProductDraftSummary | null>;

  abstract listSlugsByShopIdAndPrefix(
    shopId: string,
    slugPrefix: string
  ): Promise<string[]>;
}
