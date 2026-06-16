import { Injectable } from '@nestjs/common';
import { ProductRecommendationQueryRepository } from '../../ports/product-recommendation-query.repository';
import type { PublicProductRecommendationSection } from '../../product.types';
import { PublicProductOrderHistoryService } from '../../services/public-product-order-history.service';
import { PublicProductViewHistoryService } from '../../services/public-product-view-history.service';
import { PUBLIC_PRODUCT_RECOMMENDATIONS_DEFAULT_LIMIT } from '../recommend-public-products/recommend-public-products.use-case';

@Injectable()
export class GetPublicProductRecommendationSectionsUseCase {
  constructor(
    private readonly productRepository: ProductRecommendationQueryRepository,
    private readonly publicProductViewHistoryService: PublicProductViewHistoryService,
    private readonly publicProductOrderHistoryService: PublicProductOrderHistoryService
  ) {}

  async execute(
    shopSlug: string,
    productSlug: string,
    limit: number = PUBLIC_PRODUCT_RECOMMENDATIONS_DEFAULT_LIMIT
  ): Promise<PublicProductRecommendationSection[]> {
    const [
      similarProducts,
      sameSellerProducts,
      customersAlsoViewed,
      frequentlyBoughtTogether,
    ] = await Promise.all([
      this.productRepository.recommendSimilarPublic({
        shopSlug,
        productSlug,
        limit,
      }),
      this.productRepository.listPublicByShopSlug({
        shopSlug,
        excludeProductSlug: productSlug,
        limit,
      }),
      this.publicProductViewHistoryService.listAlsoViewedProducts({
        shopSlug,
        productSlug,
        limit,
      }),
      this.publicProductOrderHistoryService.listFrequentlyBoughtTogether({
        shopSlug,
        productSlug,
        limit,
      }),
    ]);

    const sections: PublicProductRecommendationSection[] = [
      {
        type: 'similar_products',
        title: 'Similar products',
        items: similarProducts,
      },
      {
        type: 'from_same_seller',
        title: 'More from this seller',
        items: sameSellerProducts,
      },
      {
        type: 'customers_also_viewed',
        title: 'Customers also viewed',
        items: customersAlsoViewed,
      },
      {
        type: 'frequently_bought_together',
        title: 'Frequently bought together',
        items: frequentlyBoughtTogether,
      },
    ];

    return sections.filter((section) => section.items.length > 0);
  }
}
