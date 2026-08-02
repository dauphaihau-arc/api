import { Injectable } from '@nestjs/common';
import { ShopDashboardQueryRepository } from '../../ports/shop-dashboard-query.repository';
import type {
  ShopDashboardResult,
  ShopDashboardTimeRange,
} from '../../order.types';
import { resolveShopDashboardPeriod } from './dashboard-period';

const RECENT_ORDERS_LIMIT = 5;
const TOP_PRODUCTS_LIMIT = 5;

@Injectable()
export class GetShopDashboardUseCase {
  constructor(
    private readonly shopDashboardQueryRepository: ShopDashboardQueryRepository,
  ) {}

  async execute(input: {
    shopId: string;
    currency: string;
    range?: ShopDashboardTimeRange;
  }): Promise<ShopDashboardResult> {
    const period = resolveShopDashboardPeriod({
      range: input.range,
    });

    const overview = await this.shopDashboardQueryRepository.getOverview({
      shopId: input.shopId,
      currency: input.currency,
      period,
      recentOrdersLimit: RECENT_ORDERS_LIMIT,
      topProductsLimit: TOP_PRODUCTS_LIMIT,
    });

    const { periodFrom, ...dashboardOverview } = overview;

    const resolvedPeriod = period.range === 'all_time' && periodFrom
      ? { ...period, from: periodFrom }
      : period;

    return {
      period: resolvedPeriod,
      ...dashboardOverview,
    };
  }
}
