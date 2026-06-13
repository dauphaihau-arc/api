import type { PublicProductFacet } from '../../app/product.types';
import type { PublicProductFacetResponse } from './public-product-facet.response';

export function toPublicProductFacetResponse(
  facets: PublicProductFacet[]
): PublicProductFacetResponse {
  return {
    facets: facets.map((facet) => ({
      facet_key: facet.facetKey,
      attribute_name: facet.attributeName,
      options: facet.options.map((option) => ({
        option_key: option.optionKey,
        value: option.value,
      })),
    })),
  };
}
