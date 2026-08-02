import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
import { toShopOrderSummary } from '../../../app/shop-order-read-model';
import type {
  ShopDashboardPeriod,
  ShopDashboardRevenuePoint,
  ShopDashboardTopProduct,
} from '../../../app/order.types';
import {
  GetShopDashboardOverviewRepositoryInput,
  GetShopDashboardOverviewRepositoryResult,
  ShopDashboardQueryRepository,
} from '../../../app/ports/shop-dashboard-query.repository';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';

type RevenueRow = {
  date: string;
  label?: string;
  revenue_minor: string | number | null;
  order_count: string | number | null;
};

type SummaryRow = {
  revenue_minor: string | number | null;
  order_count: string | number | null;
  first_order_at: Date | string | null;
};

type ItemsSoldRow = {
  items_sold: string | number | null;
};

type TopProductRow = {
  product_id: string;
  title: string;
  slug: string;
  image_url: string | null;
  quantity_sold: string | number | null;
  order_count: string | number | null;
  revenue_minor: string | number | null;
};

@Injectable()
export class MikroOrmShopDashboardQueryRepository
implements ShopDashboardQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async getOverview(
    input: GetShopDashboardOverviewRepositoryInput,
  ): Promise<GetShopDashboardOverviewRepositoryResult> {
    const entityManager = this.entityManager.fork();

    const [
      summaryRow,
      itemsSoldRow,
      revenueRows,
      topProductRows,
      recentOrders,
    ] = await Promise.all([
      this.loadSummary(entityManager, input),
      this.loadItemsSold(entityManager, input),
      this.loadRevenueSeries(entityManager, input),
      this.loadTopProducts(entityManager, input),
      this.loadRecentOrders(entityManager, input),
    ]);

    const revenueMinor = toNumber(summaryRow.revenue_minor);
    const orderCount = toNumber(summaryRow.order_count);

    const recentOrderItems = await this.loadOrderItems(
      entityManager,
      recentOrders.map((order) => order.id),
    );

    return {
      ...(input.period.range === 'all_time'
        ? { periodFrom: toDate(summaryRow?.first_order_at) ?? input.period.from }
        : {}),
      summary: {
        revenueMinor,
        orderCount,
        itemsSold: toNumber(itemsSoldRow.items_sold),
        averageOrderValueMinor: orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0,
        currency: input.currency,
      },
      revenueSeries: buildRevenueSeries(input.period, revenueRows),
      recentOrders: recentOrders.map((order) =>
        toShopOrderSummary(order, recentOrderItems.get(order.id) ?? []),
      ),
      topSellingProducts: topProductRows.map((row): ShopDashboardTopProduct => {
        const imageUrl = resolveImageUrl(this.storageService, row.image_url);

        return {
          productId: row.product_id,
          title: row.title,
          slug: row.slug,
          ...(imageUrl ? { imageUrl } : {}),
          quantitySold: toNumber(row.quantity_sold),
          orderCount: toNumber(row.order_count),
          revenueMinor: toNumber(row.revenue_minor),
          currency: input.currency,
        };
      }),
    };
  }

  private async loadSummary(
    entityManager: EntityManager,
    input: GetShopDashboardOverviewRepositoryInput,
  ): Promise<SummaryRow> {
    const rows = await entityManager.getConnection().execute<SummaryRow[]>(
      `
        select
          count(*) as order_count,
          min(created_at) as first_order_at,
          coalesce(sum(total_minor), 0) as revenue_minor
        from orders
        where shop_id = ?
          and currency = ?
          and status in (?, ?)
          and created_at >= ?
          and created_at <= ?
      `,
      [
        input.shopId,
        input.currency,
        OrderStatus.PAID,
        OrderStatus.COMPLETED,
        input.period.from,
        input.period.to,
      ],
    );

    return rows[0] ?? {
      revenue_minor: 0,
      order_count: 0,
      first_order_at: null,
    };
  }

  private async loadItemsSold(
    entityManager: EntityManager,
    input: GetShopDashboardOverviewRepositoryInput,
  ): Promise<ItemsSoldRow> {
    const rows = await entityManager.getConnection().execute<ItemsSoldRow[]>(
      `
        select coalesce(sum(oi.quantity), 0) as items_sold
        from order_items oi
        inner join orders o on o.id = oi.order_id
        where o.shop_id = ?
          and o.currency = ?
          and o.status in (?, ?)
          and o.created_at >= ?
          and o.created_at <= ?
      `,
      [
        input.shopId,
        input.currency,
        OrderStatus.PAID,
        OrderStatus.COMPLETED,
        input.period.from,
        input.period.to,
      ],
    );

    return rows[0] ?? { items_sold: 0 };
  }

  private loadRevenueSeries(
    entityManager: EntityManager,
    input: GetShopDashboardOverviewRepositoryInput,
  ): Promise<RevenueRow[]> {
    if (input.period.range === 'today' || input.period.range === 'yesterday') {
      return entityManager.getConnection().execute<RevenueRow[]>(
        `
          select
            to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:00:00"Z"') as date,
            to_char(date_trunc('hour', created_at), 'HH24:00') as label,
            coalesce(sum(total_minor), 0) as revenue_minor,
            count(*) as order_count
          from orders
          where shop_id = ?
            and currency = ?
            and status in (?, ?)
            and created_at >= ?
            and created_at <= ?
          group by date_trunc('hour', created_at)
          order by date_trunc('hour', created_at) asc
        `,
        [
          input.shopId,
          input.currency,
          OrderStatus.PAID,
          OrderStatus.COMPLETED,
          input.period.from,
          input.period.to,
        ],
      );
    }

    if (input.period.range === 'all_time') {
      return entityManager.getConnection().execute<RevenueRow[]>(
        `
          select
            to_char(date_trunc('month', created_at), 'YYYY-MM') as date,
            to_char(date_trunc('month', created_at), 'Mon YYYY') as label,
            coalesce(sum(total_minor), 0) as revenue_minor,
            count(*) as order_count
          from orders
          where shop_id = ?
            and currency = ?
            and status in (?, ?)
            and created_at <= ?
          group by date_trunc('month', created_at)
          order by date_trunc('month', created_at) asc
        `,
        [
          input.shopId,
          input.currency,
          OrderStatus.PAID,
          OrderStatus.COMPLETED,
          input.period.to,
        ],
      );
    }

    return entityManager.getConnection().execute<RevenueRow[]>(
      `
        select
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
          coalesce(sum(total_minor), 0) as revenue_minor,
          count(*) as order_count
        from orders
        where shop_id = ?
          and currency = ?
          and status in (?, ?)
          and created_at >= ?
          and created_at <= ?
        group by date_trunc('day', created_at)
        order by date_trunc('day', created_at) asc
      `,
      [
        input.shopId,
        input.currency,
        OrderStatus.PAID,
        OrderStatus.COMPLETED,
        input.period.from,
        input.period.to,
      ],
    );
  }

  private loadTopProducts(
    entityManager: EntityManager,
    input: GetShopDashboardOverviewRepositoryInput,
  ): Promise<TopProductRow[]> {
    return entityManager.getConnection().execute<TopProductRow[]>(
      `
        select
          oi.product_id,
          max(oi.title) as title,
          max(p.slug) as slug,
          max(oi.image_url) as image_url,
          coalesce(sum(oi.quantity), 0) as quantity_sold,
          count(distinct oi.order_id) as order_count,
          coalesce(sum(oi.line_total_minor), 0) as revenue_minor,
          max(o.created_at) as latest_order_at
        from order_items oi
        inner join orders o on o.id = oi.order_id
        inner join products p on p.id = oi.product_id
        where o.shop_id = ?
          and o.currency = ?
          and o.status in (?, ?)
          and o.created_at >= ?
          and o.created_at <= ?
        group by oi.product_id
        order by quantity_sold desc, revenue_minor desc, latest_order_at desc
        limit ?
      `,
      [
        input.shopId,
        input.currency,
        OrderStatus.PAID,
        OrderStatus.COMPLETED,
        input.period.from,
        input.period.to,
        input.topProductsLimit,
      ],
    );
  }

  private loadRecentOrders(
    entityManager: EntityManager,
    input: GetShopDashboardOverviewRepositoryInput,
  ): Promise<OrderEntity[]> {
    return entityManager.getRepository(OrderEntity).find(
      {
        shop: input.shopId,
        createdAt: {
          $gte: input.period.from,
          $lte: input.period.to,
        },
      },
      {
        populate: ['shop'],
        orderBy: { createdAt: 'desc' },
        limit: input.recentOrdersLimit,
      },
    );
  }

  private async loadOrderItems(
    entityManager: EntityManager,
    orderIds: string[],
  ): Promise<Map<string, OrderItemEntity[]>> {
    if (orderIds.length === 0) {
      return new Map();
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: { $in: orderIds } },
      { populate: ['product', 'product.shop', 'inventory'] },
    );

    return items.reduce((accumulator, item) => {
      const orderItems = accumulator.get(item.order.id) ?? [];
      orderItems.push(item);
      accumulator.set(item.order.id, orderItems);
      return accumulator;
    }, new Map<string, OrderItemEntity[]>());
  }
}

function buildRevenueSeries(
  period: ShopDashboardPeriod,
  rows: RevenueRow[],
): ShopDashboardRevenuePoint[] {
  if (period.range === 'all_time') {
    return rows.map((row) => ({
      date: row.date,
      label: row.label ?? row.date,
      revenueMinor: toNumber(row.revenue_minor),
      orderCount: toNumber(row.order_count),
    }));
  }

  if (period.range === 'today' || period.range === 'yesterday') {
    return buildHourlyRevenueSeries(period, rows);
  }

  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const points: ShopDashboardRevenuePoint[] = [];
  const startDate = DateTime.fromJSDate(period.from, { zone: 'utc' }).startOf('day');
  const endDate = DateTime.fromJSDate(period.to, { zone: 'utc' });

  // Fill missing days so the chart keeps a continuous daily timeline.
  for (let day = startDate; day <= endDate; day = day.plus({ days: 1 })) {
    points.push(toRevenuePoint(day, rowsByDate));
  }

  return points;
}

function buildHourlyRevenueSeries(
  period: ShopDashboardPeriod,
  rows: RevenueRow[],
): ShopDashboardRevenuePoint[] {
  const rowsByHour = new Map(rows.map((row) => [row.date, row]));
  const points: ShopDashboardRevenuePoint[] = [];
  const startHour = DateTime.fromJSDate(period.from, { zone: 'utc' }).startOf('hour');
  const endHour = DateTime.fromJSDate(period.to, { zone: 'utc' }).startOf('hour');

  // Today fills midnight through the current hour; yesterday fills all 24 hours.
  for (let hour = startHour; hour <= endHour; hour = hour.plus({ hours: 1 })) {
    const date = hour.toFormat('yyyy-MM-dd\'T\'HH:00:00\'Z\'');
    const row = rowsByHour.get(date);

    points.push({
      date,
      label: hour.toFormat('HH:00'),
      revenueMinor: toNumber(row?.revenue_minor),
      orderCount: toNumber(row?.order_count),
    });
  }

  return points;
}

function toRevenuePoint(
  day: DateTime,
  rowsByDate: Map<string, RevenueRow>,
): ShopDashboardRevenuePoint {
  const date = day.toFormat('yyyy-MM-dd');
  const row = rowsByDate.get(date);

  return {
    date,
    label: day.toFormat('LLL d'),
    revenueMinor: toNumber(row?.revenue_minor),
    orderCount: toNumber(row?.order_count),
  };
}

function toNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function resolveImageUrl(
  storageService: StorageService,
  imageUrl: string | null,
): string | undefined {
  if (!imageUrl) {
    return undefined;
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  return storageService.getPublicUrl(imageUrl) ?? imageUrl;
}
