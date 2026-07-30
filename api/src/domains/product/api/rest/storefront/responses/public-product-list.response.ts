import type { PublicProductListItemResponse } from './public-product-list-item.response';

export type PublicProductListResponse = {
  items: PublicProductListItemResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
};
