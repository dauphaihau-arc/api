import type {
  PublicProductFacet,
  ListPublicProductsInput,
  PublicProductDetail,
  PublicProductListResult,
  PublicProductSuggestion,
  SuggestPublicProductsInput
} from '../product.types';

export abstract class StorefrontProductQueryRepository {
  abstract findPublicByShopSlugAndProductSlug(
    shopSlug: string,
    productSlug: string
  ): Promise<PublicProductDetail | null>;

  abstract listPublic(
    input: ListPublicProductsInput
  ): Promise<PublicProductListResult>;

  abstract listPublicFacets(
    input: ListPublicProductsInput
  ): Promise<PublicProductFacet[]>;

  abstract suggestPublic(
    input: SuggestPublicProductsInput
  ): Promise<PublicProductSuggestion[]>;
}
