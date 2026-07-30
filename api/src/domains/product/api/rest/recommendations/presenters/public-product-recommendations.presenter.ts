import type { PublicProductListItem } from '../../../../app/product.types';
import { toPublicProductListItemResponse } from '../../storefront/presenters/public-product-list-item.presenter';
import type { PublicProductRecommendationsResponse } from '../response/public-product-recommendations.response';

export const toPublicProductRecommendationsResponse = (
  items: PublicProductListItem[],
): PublicProductRecommendationsResponse => ({
  items: items.map(toPublicProductListItemResponse),
});
