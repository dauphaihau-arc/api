import type { PublicProductListItem } from '../../../../app/product.types';

export type PublicProductListItemResponse = {
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
    url?: string;
    variant?: string;
    variants?: Record<string, {
      url?: string;
    }>;
  };
  variant_type?: PublicProductListItem['variantType'];
  pricing?: {
    min_amount_minor?: number;
    max_amount_minor?: number;
    original_min_amount_minor?: number;
    original_max_amount_minor?: number;
    currency?: string;
    auto_sale?: {
      coupon_id: string;
      percent_off: number;
    };
  };
  availability: {
    in_stock: boolean;
    low_stock: boolean;
    stock_total: number;
  };
  variant_count: number;
  has_free_shipping?: boolean;
  created_at: Date;
};
