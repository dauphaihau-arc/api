import type {
  ListPublicProductsByShopSlugInput,
  PublicProductListItem,
  RecommendPublicProductsInput
} from '../product.types';

export abstract class ProductRecommendationQueryRepository {
  abstract listPublicByShopSlug(
    input: ListPublicProductsByShopSlugInput
  ): Promise<PublicProductListItem[]>;

  abstract recommendSimilarPublic(
    input: RecommendPublicProductsInput
  ): Promise<PublicProductListItem[]>;
}
