import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from './job.types';
import { PublicProductBestSellerRankingService } from '~/modules/domains/product/app/services/public-product-best-seller-ranking.service';

type RefreshBestSellerRankingsPayload =
  AppJobPayloadMap['product.refresh-best-seller-rankings'];

@Injectable()
export class RefreshBestSellerRankingsJob {
  private readonly logger = new Logger(RefreshBestSellerRankingsJob.name);

  constructor(
    private readonly publicProductBestSellerRankingService: PublicProductBestSellerRankingService,
  ) {}

  async run(payload: RefreshBestSellerRankingsPayload): Promise<void> {
    await this.publicProductBestSellerRankingService.refreshRankings({
      windowDays: payload.windowDays,
      limit: payload.limit,
    });

    this.logger.log(
      `Refreshed best-seller rankings for ${payload.windowDays}d window`,
    );
  }
}
