export type PublicProductReviewImageListResponse = {
  items: Array<{
    id: string;
    storage_key: string;
    url?: string;
    rank: number;
    review_id: string;
    review_title?: string;
    created_at: Date;
    variants?: Record<string, {
      storage_key: string;
      url?: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
    author: {
      display_name: string;
    };
  }>;
  meta: {
    next_cursor?: string;
    has_more: boolean;
  };
};
