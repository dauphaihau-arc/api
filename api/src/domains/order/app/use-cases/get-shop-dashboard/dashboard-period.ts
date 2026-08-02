import { DateTime } from 'luxon';
import type {
  ShopDashboardPeriod,
  ShopDashboardTimeRange,
} from '../../order.types';

export const DEFAULT_SHOP_DASHBOARD_RANGE: ShopDashboardTimeRange = 'last_7_days';
export const DEFAULT_SHOP_DASHBOARD_TIME_ZONE = 'UTC';

const ALL_TIME_FROM = new Date(0);

export function resolveShopDashboardPeriod(input: {
  range?: ShopDashboardTimeRange;
  now?: Date;
  timeZone?: string;
}): ShopDashboardPeriod {
  const range = input.range ?? DEFAULT_SHOP_DASHBOARD_RANGE;
  const timeZone = input.timeZone ?? DEFAULT_SHOP_DASHBOARD_TIME_ZONE;
  const now = DateTime.fromJSDate(input.now ?? new Date(), { zone: timeZone });
  const todayStart = now.startOf('day');

  switch (range) {
    case 'today':
      return toPeriod({
        range,
        from: todayStart,
        to: now,
      });
    case 'yesterday': {
      const from = todayStart.minus({ days: 1 });
      return toPeriod({
        range,
        from,
        to: from.endOf('day'),
      });
    }
    case 'last_30_days':
      return toPeriod({
        range,
        from: todayStart.minus({ days: 29 }),
        to: now,
      });
    case 'this_month':
      return toPeriod({
        range,
        from: now.startOf('month'),
        to: now,
      });
    case 'last_month': {
      const from = now.startOf('month').minus({ months: 1 });
      return toPeriod({
        range,
        from,
        to: from.endOf('month'),
      });
    }
    case 'all_time':
      return {
        range,
        from: ALL_TIME_FROM,
        to: now.toUTC().toJSDate(),
      };
    case 'last_7_days':
    default:
      return toPeriod({
        range: DEFAULT_SHOP_DASHBOARD_RANGE,
        from: todayStart.minus({ days: 6 }),
        to: now,
      });
  }
}

function toPeriod(input: {
  range: ShopDashboardTimeRange;
  from: DateTime;
  to: DateTime;
}): ShopDashboardPeriod {
  return {
    range: input.range,
    from: input.from.toUTC().toJSDate(),
    to: input.to.toUTC().toJSDate(),
  };
}
