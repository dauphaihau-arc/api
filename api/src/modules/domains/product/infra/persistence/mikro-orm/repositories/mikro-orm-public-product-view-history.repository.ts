import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { PublicProductViewHistoryRepository } from '../../../../app/ports/public-product-view-history.repository';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { ProductEntity } from '../entities/product.entity';
import { ProductViewHistoryEntity } from '../entities/product-view-history.entity';

const DAY_IN_MS = ms('1d');

@Injectable()
export class MikroOrmPublicProductViewHistoryRepository
implements PublicProductViewHistoryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async recordView(input: {
    productId: string;
    userId?: string;
    guestSessionId?: string;
  }): Promise<void> {
    if (!input.userId && !input.guestSessionId) {
      return;
    }

    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductViewHistoryEntity);
    const existing = input.userId
      ? await repository.findOne({
        product: input.productId,
        user: input.userId,
      })
      : await repository.findOne({
        product: input.productId,
        guestSessionId: input.guestSessionId,
      });

    if (existing) {
      existing.viewedAt = new Date();
      await entityManager.flush();
      return;
    }

    const history = repository.create({
      product: entityManager.getReference(ProductEntity, input.productId),
      ...(input.userId
        ? { user: entityManager.getReference(CurrentUserEntity, input.userId) }
        : { guestSessionId: input.guestSessionId }),
      viewedAt: new Date(),
    });

    await entityManager.persistAndFlush(history);
  }

  async listRecentViewProductIds(input: {
    userId?: string;
    guestSessionId?: string;
    limit: number;
  }): Promise<string[]> {
    if (!input.userId && !input.guestSessionId) {
      return [];
    }

    const history = await this.entityManager.fork().getRepository(ProductViewHistoryEntity).find(
      input.userId
        ? { user: input.userId }
        : { guestSessionId: input.guestSessionId },
      {
        orderBy: { viewedAt: 'desc' },
        limit: input.limit,
      },
    );

    return history.map((entry) => entry.product.id);
  }

  async listTrendingProductIds(input: {
    limit: number;
    windowDays?: number;
  }): Promise<string[]> {
    const rows = await this.entityManager.fork().getConnection().execute<Array<{
      product_id: string;
    }>>(
      `
        select pvh.product_id
        from product_view_history pvh
        inner join products p on p.id = pvh.product_id
        where pvh.viewed_at >= ?
          and p.state = ?
          and exists (
            select 1
            from product_images pi
            where pi.product_id = p.id
          )
        group by pvh.product_id
        order by count(*) desc, max(pvh.viewed_at) desc
        limit ?
      `,
      [
        buildLookbackStart(input.windowDays ?? 14),
        ProductState.ACTIVE,
        Math.max(input.limit * 4, input.limit),
      ],
    );

    return rows.map((row) => row.product_id);
  }

  async listAlsoViewedProductIds(input: {
    productId: string;
    limit: number;
    windowDays?: number;
  }): Promise<string[]> {
    const lookbackStart = buildLookbackStart(input.windowDays ?? 30);
    const rows = await this.entityManager.fork().getConnection().execute<Array<{
      product_id: string;
    }>>(
      `
        select related.product_id
        from product_view_history anchor
        inner join product_view_history related
          on related.product_id <> anchor.product_id
         and (
           (anchor.user_id is not null and related.user_id = anchor.user_id)
           or (
             anchor.guest_session_id is not null
             and related.guest_session_id = anchor.guest_session_id
           )
         )
        inner join products p on p.id = related.product_id
        where anchor.product_id = ?
          and anchor.viewed_at >= ?
          and related.viewed_at >= ?
          and p.state = ?
          and exists (
            select 1
            from product_images pi
            where pi.product_id = p.id
          )
        group by related.product_id
        order by count(*) desc, max(related.viewed_at) desc
        limit ?
      `,
      [
        input.productId,
        lookbackStart,
        lookbackStart,
        ProductState.ACTIVE,
        Math.max(input.limit * 4, input.limit),
      ],
    );

    return rows.map((row) => row.product_id);
  }
}

function buildLookbackStart(windowDays: number): Date {
  return new Date(Date.now() - (windowDays * DAY_IN_MS));
}
