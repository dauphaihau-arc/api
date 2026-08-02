import type {
  ShopDashboardPeriod,
  ShopDashboardRevenuePoint,
  ShopDashboardSummary,
  ShopDashboardTopProduct,
  ShopOrderSummary,
} from '../order.types';

export interface GetShopDashboardOverviewRepositoryInput {
  shopId: string;
  currency: string;
  period: ShopDashboardPeriod;
  recentOrdersLimit: number;
  topProductsLimit: number;
}

export interface GetShopDashboardOverviewRepositoryResult {
  periodFrom?: Date;
  summary: ShopDashboardSummary;
  revenueSeries: ShopDashboardRevenuePoint[];
  recentOrders: ShopOrderSummary[];
  topSellingProducts: ShopDashboardTopProduct[];
}

export abstract class ShopDashboardQueryRepository {
  abstract getOverview(
    input: GetShopDashboardOverviewRepositoryInput
  ): Promise<GetShopDashboardOverviewRepositoryResult>;
}
