import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';
import { PublicProductOrderHistoryRepository } from '../../../../app/ports/public-product-order-history.repository';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { ProductBestSellerRankingEntity } from '../entities/product-best-seller-ranking.entity';

const DAY_IN_MS = ms('1d');

@Injectable()
export class MikroOrmPublicProductOrderHistoryRepository
implements PublicProductOrderHistoryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async listBestSellingProductIds(input: {
    limit: number;
    windowDays?: number;
  }): Promise<string[]> {
    const windowDays = input.windowDays ?? 180;
    const rankingRepository = this.entityManager.fork().getRepository(ProductBestSellerRankingEntity);

    let rows = await rankingRepository.getEntityManager().getConnection().execute<Array<{
      product_id: string;
    }>>(
      `
        select product_id
        from product_best_seller_rankings
        where window_days = ?
        order by rank asc
        limit ?
      `,
      [windowDays, Math.max(input.limit * 4, input.limit)],
    );

    if (rows.length === 0) {
      await this.refreshBestSellingProductRankings({
        windowDays,
        limit: buildRefreshLimit(input.limit),
      });

      rows = await rankingRepository.getEntityManager().getConnection().execute<Array<{
        product_id: string;
      }>>(
        `
          select product_id
          from product_best_seller_rankings
          where window_days = ?
          order by rank asc
          limit ?
        `,
        [windowDays, Math.max(input.limit * 4, input.limit)],
      );
    }

    return rows.map((row) => row.product_id);
  }

  async refreshBestSellingProductRankings(input: {
    limit: number;
    windowDays?: number;
  }): Promise<void> {
    const windowDays = input.windowDays ?? 180;

    await this.entityManager.transactional(async (entityManager) => {
      await entityManager.getConnection().execute(
        'delete from product_best_seller_rankings where window_days = ?',
        [windowDays],
      );

      await entityManager.getConnection().execute(
        `
          insert into product_best_seller_rankings (
            id,
            created_at,
            updated_at,
            product_id,
            window_days,
            rank,
            order_count,
            latest_order_at
          )
          with ranked_candidates as (
            select
              oi.product_id,
              count(distinct oi.order_id) as order_count,
              max(o.created_at) as latest_order_at
            from order_items oi
            inner join orders o on o.id = oi.order_id
            where o.status in (?, ?)
              and o.created_at >= ?
            group by oi.product_id
            order by order_count desc, latest_order_at desc
            limit ?
          )
          select
            gen_random_uuid(),
            now(),
            now(),
            ranked_candidates.product_id,
            ?,
            row_number() over (
              order by ranked_candidates.order_count desc, ranked_candidates.latest_order_at desc
            ),
            ranked_candidates.order_count,
            ranked_candidates.latest_order_at
          from ranked_candidates
          inner join products p on p.id = ranked_candidates.product_id
          where p.state = ?
            and exists (
              select 1
              from product_images pi
              where pi.product_id = p.id
            )
        `,
        [
          OrderStatus.PAID,
          OrderStatus.COMPLETED,
          buildLookbackStart(windowDays),
          input.limit,
          windowDays,
          ProductState.ACTIVE,
        ],
      );
    });
  }

  async listFrequentlyBoughtTogetherProductIds(input: {
    productId: string;
    limit: number;
    windowDays?: number;
  }): Promise<string[]> {
    const rows = await this.listFrequentlyBoughtTogetherCandidates(input);

    return rows.map((row) => row.product_id);
  }

  private async listFrequentlyBoughtTogetherCandidates(input: {
    productId: string;
    limit: number;
    windowDays?: number;
  }): Promise<Array<{ product_id: string }>> {
    return this.entityManager.fork().getConnection().execute<Array<{
      product_id: string;
    }>>(
      `
        with ranked_candidates as (
          select
            related.product_id,
            count(distinct anchor.order_id) as order_count,
            max(o.created_at) as latest_order_at
          from order_items anchor
          inner join order_items related
            on related.order_id = anchor.order_id
           and related.product_id <> anchor.product_id
          inner join orders o on o.id = anchor.order_id
          where anchor.product_id = ?
            and o.status in (?, ?)
            and o.created_at >= ?
          group by related.product_id
          order by order_count desc, latest_order_at desc
          limit ?
        )
        select ranked_candidates.product_id
        from ranked_candidates
        inner join products p on p.id = ranked_candidates.product_id
        where p.state = ?
          and exists (
            select 1
            from product_images pi
            where pi.product_id = p.id
          )
        order by ranked_candidates.order_count desc, ranked_candidates.latest_order_at desc
      `,
      [
        input.productId,
        OrderStatus.PAID,
        OrderStatus.COMPLETED,
        buildLookbackStart(input.windowDays ?? 180),
        buildCandidateLimit(input.limit),
        ProductState.ACTIVE,
      ],
    );
  }
}

function buildLookbackStart(windowDays: number): Date {
  return new Date(Date.now() - (windowDays * DAY_IN_MS));
}

function buildCandidateLimit(limit: number): number {
  return Math.max(limit * 20, limit);
}

function buildRefreshLimit(limit: number): number {
  return Math.max(limit * 50, 500);
}
