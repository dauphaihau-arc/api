export type ShopProductReviewResponse = {
  id: string;
  order_id: string;
  order_item_id: string;
  rating: number;
  title?: string;
  body?: string;
  status: string;
  images: Array<{
    id: string;
    storage_key: string;
    url?: string;
    rank: number;
    variant_status?: string;
    variant_error?: string;
    variants_generated_at?: Date;
    variants?: Record<string, {
      storage_key: string;
      url?: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
  }>;
  created_at: Date;
  updated_at: Date;
  author: {
    id: string;
    display_name: string;
    email: string;
  };
  product: {
    id: string;
    title: string;
    slug: string;
  };
};

export type ShopProductReviewListResponse = {
  items: ShopProductReviewResponse[];
  counts: {
    all: number;
    published: number;
    hidden: number;
  };
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
};
