import type { PublicProductRecommendationSectionType } from '../../../../app/product.types';
import type { PublicProductRecommendationsResponse } from './public-product-recommendations.response';

export type PublicProductRecommendationSectionsResponse = {
  sections: Array<{
    type: PublicProductRecommendationSectionType;
    title: string;
    items: PublicProductRecommendationsResponse['items'];
  }>;
};
