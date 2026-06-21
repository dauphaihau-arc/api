import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderStatus } from '~/modules/domains/order/domain/enums/order-status.enum';
import { PublicProductOrderHistoryRepository } from '../../../../app/ports/public-product-order-history.repository';
import { ProductState } from '../../../../domain/enums/product-state.enum';

@Injectable()
export class MikroOrmPublicProductOrderHistoryRepository
implements PublicProductOrderHistoryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async listBestSellingProductIds(input: {
    limit: number;
    windowDays?: number;
  }): Promise<string[]> {
    const rows = await this.entityManager.fork().getConnection().execute<Array<{
      product_id: string;
    }>>(
      `
        select oi.product_id
        from order_items oi
        inner join orders o on o.id = oi.order_id
        inner join products p on p.id = oi.product_id
        where o.status in (?, ?)
          and o.created_at >= ?
          and p.state = ?
          and exists (
            select 1
            from product_images pi
            where pi.product_id = p.id
          )
        group by oi.product_id
        order by count(distinct oi.order_id) desc, max(o.created_at) desc
        limit ?
      `,
      [
        OrderStatus.PAID,
        OrderStatus.COMPLETED,
        buildLookbackStart(input.windowDays ?? 180),
        ProductState.ACTIVE,
        Math.max(input.limit * 4, input.limit),
      ],
    );

    return rows.map((row) => row.product_id);
  }

  async listFrequentlyBoughtTogetherProductIds(input: {
    productId: string;
    limit: number;
    windowDays?: number;
  }): Promise<string[]> {
    const rows = await this.entityManager.fork().getConnection().execute<Array<{
      product_id: string;
    }>>(
      `
        select related.product_id
        from order_items anchor
        inner join order_items related
          on related.order_id = anchor.order_id
         and related.product_id <> anchor.product_id
        inner join orders o on o.id = anchor.order_id
        inner join products p on p.id = related.product_id
        where anchor.product_id = ?
          and o.status in (?, ?)
          and o.created_at >= ?
          and p.state = ?
          and exists (
            select 1
            from product_images pi
            where pi.product_id = p.id
          )
        group by related.product_id
        order by count(distinct anchor.order_id) desc, max(o.created_at) desc
        limit ?
      `,
      [
        input.productId,
        OrderStatus.PAID,
        OrderStatus.COMPLETED,
        buildLookbackStart(input.windowDays ?? 180),
        ProductState.ACTIVE,
        Math.max(input.limit * 4, input.limit),
      ],
    );

    return rows.map((row) => row.product_id);
  }
}

function buildLookbackStart(windowDays: number): Date {
  return new Date(Date.now() - (windowDays * 24 * 60 * 60 * 1000));
}
