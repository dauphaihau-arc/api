import type {
  ListPublicProductsByShopSlugInput,
  PublicProductListItem,
  RecommendPublicProductsInput,
} from '../../app/product.types';
import type { ProductRecommendationQueryRepository } from '../../app/ports/product-recommendation-query.repository';
import type { PublicProductLocalizationService } from '../../app/services/public-product-localization.service';

/**
 * Applies Localized Content to recommendation reads, batching translation
 * lookups for each recommendation source instead of querying per row.
 */
export class LocalizedProductRecommendationQueryRepository
implements ProductRecommendationQueryRepository {
  constructor(
    private readonly delegate: ProductRecommendationQueryRepository,
    private readonly localizationService: PublicProductLocalizationService,
  ) {}

  async listPublicByShopSlug(
    input: ListPublicProductsByShopSlugInput,
  ): Promise<PublicProductListItem[]> {
    return this.localizationService.localizeProductCards(
      await this.delegate.listPublicByShopSlug(input),
    );
  }

  async recommendSimilarPublic(
    input: RecommendPublicProductsInput,
  ): Promise<PublicProductListItem[]> {
    return this.localizationService.localizeProductCards(
      await this.delegate.recommendSimilarPublic(input),
    );
  }
}
