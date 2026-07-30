export abstract class PublicProductViewHistoryRepository {
  abstract recordView(input: {
    productId: string;
    userId?: string;
    guestSessionId?: string;
  }): Promise<void>;

  abstract listRecentViewProductIds(input: {
    userId?: string;
    guestSessionId?: string;
    limit: number;
  }): Promise<string[]>;

  abstract listTrendingProductIds(input: {
    limit: number;
    windowDays?: number;
  }): Promise<string[]>;

  abstract listAlsoViewedProductIds(input: {
    productId: string;
    limit: number;
    windowDays?: number;
  }): Promise<string[]>;
}
