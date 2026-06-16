import type { PublicProductRecommendationSection } from '../../app/product.types';
import { toPublicProductListItemResponse } from './public-product-recommendations.presenter';
import type { PublicProductRecommendationSectionsResponse } from './public-product-recommendation-sections.response';

export const toPublicProductRecommendationSectionsResponse = (
  sections: PublicProductRecommendationSection[]
): PublicProductRecommendationSectionsResponse => ({
  sections: sections.map((section) => ({
    type: section.type,
    title: section.title,
    items: section.items.map(toPublicProductListItemResponse),
  })),
});
