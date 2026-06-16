import type { PublicProductSuggestion } from '../../../../app/product.types';
import type { PublicProductSuggestionResponse } from '../responses/public-product-suggestion.response';

export const toPublicProductSuggestionResponse = (
  product: PublicProductSuggestion
): PublicProductSuggestionResponse => ({
  id: product.id,
  title: product.title,
  slug: product.slug,
  shop: {
    id: product.shop.id,
    public_id: product.shop.publicId,
    shop_name: product.shop.shopName,
    slug: product.shop.slug,
  },
});
