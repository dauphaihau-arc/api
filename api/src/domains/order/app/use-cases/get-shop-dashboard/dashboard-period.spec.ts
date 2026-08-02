import { resolveShopDashboardPeriod } from './dashboard-period';

describe('resolveShopDashboardPeriod', () => {
  const now = new Date('2026-08-02T06:00:00.000Z');

  it('resolves today in the shop time zone', () => {
    const period = resolveShopDashboardPeriod({
      range: 'today',
      now,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(period).toEqual({
      range: 'today',
      from: new Date('2026-08-01T17:00:00.000Z'),
      to: now,
    });
  });

  it('resolves yesterday in the shop time zone', () => {
    const period = resolveShopDashboardPeriod({
      range: 'yesterday',
      now,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(period).toEqual({
      range: 'yesterday',
      from: new Date('2026-07-31T17:00:00.000Z'),
      to: new Date('2026-08-01T16:59:59.999Z'),
    });
  });

  it('resolves last month in the shop time zone', () => {
    const period = resolveShopDashboardPeriod({
      range: 'last_month',
      now,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(period).toEqual({
      range: 'last_month',
      from: new Date('2026-06-30T17:00:00.000Z'),
      to: new Date('2026-07-31T16:59:59.999Z'),
    });
  });

  it('defaults to last 7 days in UTC', () => {
    const period = resolveShopDashboardPeriod({
      now,
    });

    expect(period).toEqual({
      range: 'last_7_days',
      from: new Date('2026-07-27T00:00:00.000Z'),
      to: now,
    });
  });

  it('resolves all time with a fixed lower bound', () => {
    const period = resolveShopDashboardPeriod({
      range: 'all_time',
      now,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(period).toEqual({
      range: 'all_time',
      from: new Date(0),
      to: now,
    });
  });
});
