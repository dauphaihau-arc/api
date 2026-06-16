import type { PublicProductRecommendationSection } from '../../../../app/product.types';
import { toPublicProductListItemResponse } from '../../storefront/presenters/public-product-list-item.presenter';
import type { PublicProductRecommendationSectionsResponse } from '../response/public-product-recommendation-sections.response';

export const toPublicProductRecommendationSectionsResponse = (
  sections: PublicProductRecommendationSection[]
): PublicProductRecommendationSectionsResponse => ({
  sections: sections.map((section) => ({
    type: section.type,
    title: section.title,
    items: section.items.map(toPublicProductListItemResponse),
  })),
});
