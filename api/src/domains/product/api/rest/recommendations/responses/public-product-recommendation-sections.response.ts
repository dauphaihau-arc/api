import type { PublicProductRecommendationsResponse } from './public-product-recommendations.response';

export type PublicProductRecommendationSectionsResponse = {
  sections: Array<{
    type:
      | 'similar_products'
      | 'from_same_seller'
      | 'customers_also_viewed'
      | 'frequently_bought_together';
    title: string;
    items: PublicProductRecommendationsResponse['items'];
  }>;
};
