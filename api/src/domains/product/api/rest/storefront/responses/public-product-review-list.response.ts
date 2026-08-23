export type PublicProductReviewListResponse = {
  summary: {
    average: number;
    count: number;
    breakdown: {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
    };
    filters: {
      has_images: number;
      has_comment: number;
    };
  };
  items: Array<{
    id: string;
    rating: number;
    title?: string;
    body?: string;
    image?: {
      id: string;
      url: string;
      rank: number;
      variants?: Record<string, {
        url: string;
        width?: number;
        height?: number;
        format?: string;
      }>;
    };
    created_at: Date;
    updated_at: Date;
    verified_purchase: boolean;
    author: {
      display_name: string;
    };
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
