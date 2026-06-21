import type { PublicProductListResult } from '../../../../app/product.types';
import type { PublicProductListResponse } from '../responses/public-product-list.response';
import { toPublicProductListItemResponse } from './public-product-list-item.presenter';

export const toPublicProductListResponse = (
  result: PublicProductListResult,
): PublicProductListResponse => ({
  items: result.items.map(toPublicProductListItemResponse),
  meta: {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
    total_pages: result.meta.totalPages,
    has_next_page: result.meta.hasNextPage,
    has_previous_page: result.meta.hasPreviousPage,
  },
});
