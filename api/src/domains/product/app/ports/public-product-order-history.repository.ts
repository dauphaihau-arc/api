export abstract class PublicProductOrderHistoryRepository {
  abstract listBestSellingProductIds(input: {
    limit: number;
    windowDays?: number;
  }): Promise<string[]>;

  abstract refreshBestSellingProductRankings(input: {
    limit: number;
    windowDays?: number;
  }): Promise<void>;

  abstract listFrequentlyBoughtTogetherProductIds(input: {
    productId: string;
    limit: number;
    windowDays?: number;
  }): Promise<string[]>;
}
