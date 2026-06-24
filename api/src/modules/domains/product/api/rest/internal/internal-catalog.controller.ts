import { Controller, Get, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  CatalogStatus,
  CatalogStatusService,
} from '../../../app/services/catalog-status.service';
import {
  DEFAULT_BEST_SELLER_REFRESH_LIMIT,
  DEFAULT_BEST_SELLER_WINDOW_DAYS,
  PublicProductBestSellerRankingService,
} from '../../../app/services/public-product-best-seller-ranking.service';

@Controller('internal/catalog')
@SkipThrottle()
@ApiExcludeController()
export class InternalCatalogController {
  constructor(
    private readonly catalogStatusService: CatalogStatusService,
    private readonly publicProductBestSellerRankingService: PublicProductBestSellerRankingService,
  ) {}

  @Get('status')
  async getStatus(): Promise<CatalogStatus> {
    return this.catalogStatusService.getStatus();
  }

  @Post('best-sellers/refresh')
  async refreshBestSellers(): Promise<{ ok: true }> {
    await this.publicProductBestSellerRankingService.refreshRankings({
      windowDays: DEFAULT_BEST_SELLER_WINDOW_DAYS,
      limit: DEFAULT_BEST_SELLER_REFRESH_LIMIT,
    });

    return { ok: true };
  }
}
