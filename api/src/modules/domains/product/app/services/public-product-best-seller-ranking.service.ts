import { Injectable } from '@nestjs/common';
import { PublicProductOrderHistoryRepository } from '../ports/public-product-order-history.repository';

export const DEFAULT_BEST_SELLER_WINDOW_DAYS = 180;
export const DEFAULT_BEST_SELLER_REFRESH_LIMIT = 500;

@Injectable()
export class PublicProductBestSellerRankingService {
  constructor(
    private readonly publicProductOrderHistoryRepository: PublicProductOrderHistoryRepository,
  ) {}

  async refreshRankings(input?: {
    windowDays?: number;
    limit?: number;
  }): Promise<void> {
    await this.publicProductOrderHistoryRepository.refreshBestSellingProductRankings({
      windowDays: input?.windowDays ?? DEFAULT_BEST_SELLER_WINDOW_DAYS,
      limit: input?.limit ?? DEFAULT_BEST_SELLER_REFRESH_LIMIT,
    });
  }
}
