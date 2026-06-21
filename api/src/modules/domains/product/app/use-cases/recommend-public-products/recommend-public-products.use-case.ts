import { Injectable } from '@nestjs/common';
import { ProductRecommendationQueryRepository } from '../../ports/product-recommendation-query.repository';
import type { PublicProductListItem } from '../../product.types';

export const PUBLIC_PRODUCT_RECOMMENDATIONS_DEFAULT_LIMIT = 8;

@Injectable()
export class RecommendPublicProductsUseCase {
  constructor(private readonly productRepository: ProductRecommendationQueryRepository) {}

  async execute(
    shopSlug: string,
    productSlug: string,
    limit: number = PUBLIC_PRODUCT_RECOMMENDATIONS_DEFAULT_LIMIT,
  ): Promise<PublicProductListItem[]> {
    return this.productRepository.recommendSimilarPublic({
      shopSlug,
      productSlug,
      limit,
    });
  }
}
