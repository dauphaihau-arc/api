import type { PublicProductListItem } from '../../app/product.types';

export type PublicProductListResponse = {
  items: Array<{
    id: string;
    shop: {
      id: string;
      public_id?: string;
      shop_name: string;
      slug: string;
    };
    category_id?: string;
    title: string;
    slug: string;
    image?: {
      storage_key: string;
      url?: string;
      variant?: string;
      variants?: Record<string, {
        storage_key: string;
        url?: string;
      }>;
    };
    variant_type?: PublicProductListItem['variantType'];
    inventory?: {
      price: number;
      sale_price?: number;
      stock: number;
      sku?: string;
    };
    created_at: Date;
  }>;
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
};
