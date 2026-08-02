import { IsIn, IsOptional } from 'class-validator';
import type { ShopDashboardTimeRange } from '../../../app/order.types';

export const SHOP_DASHBOARD_TIME_RANGES = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'all_time',
] as const satisfies readonly ShopDashboardTimeRange[];

export class GetShopDashboardQueryDto {
  @IsOptional()
  @IsIn(SHOP_DASHBOARD_TIME_RANGES)
  range?: ShopDashboardTimeRange;
}
