export type PublicProductListItemResponse = {
  id: string;
  shop: {
    id: string;
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
  pricing?: {
    min_amount_minor?: number;
    max_amount_minor?: number;
    original_min_amount_minor?: number;
    original_max_amount_minor?: number;
    currency?: string;
    auto_sale?: {
      promotion_id: string;
      percent_off: number;
    };
  };
  availability: {
    in_stock: boolean;
    low_stock: boolean;
    stock_total: number;
  };
  variant_count: number;
  created_at: Date;
};
