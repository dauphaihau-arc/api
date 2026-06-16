import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { StorefrontProductQueryRepository } from '../ports/storefront-product-query.repository';
import type { PublicProductListItem } from '../product.types';
import { GetPublicProductBySlugsUseCase } from '../use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { ProductState } from '../../domain/enums/product-state.enum';
import { ProductEntity } from '../../infra/persistence/entities/product.entity';
import { ProductViewHistoryEntity } from '../../infra/persistence/entities/product-view-history.entity';

@Injectable()
export class PublicProductViewHistoryService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase,
    private readonly storefrontProductQueryRepository: StorefrontProductQueryRepository
  ) {}

  async recordView(input: {
    shopSlug: string;
    productSlug: string;
    userId?: string;
    guestSessionId?: string;
  }): Promise<void> {
    const product = await this.getPublicProductBySlugsUseCase.execute(
      input.shopSlug,
      input.productSlug
    );

    if (!product?.id) {
      return;
    }

    if (!input.userId && !input.guestSessionId) {
      return;
    }

    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductViewHistoryEntity);
    const productRef = entityManager.getReference(ProductEntity, product.id);
    const existing = input.userId
      ? await repository.findOne({
        product: product.id,
        user: input.userId,
      })
      : await repository.findOne({
        product: product.id,
        guestSessionId: input.guestSessionId,
      });

    if (existing) {
      existing.viewedAt = new Date();
      await entityManager.flush();
      return;
    }

    const history = repository.create({
      product: productRef,
      ...(input.userId
        ? { user: entityManager.getReference(CurrentUserEntity, input.userId) }
        : { guestSessionId: input.guestSessionId }),
      viewedAt: new Date(),
    });

    await entityManager.persistAndFlush(history);
  }

  async listRecentViews(input: {
    userId?: string;
    guestSessionId?: string;
    limit: number;
  }): Promise<PublicProductListItem[]> {
    if (!input.userId && !input.guestSessionId) {
      return [];
    }

    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductViewHistoryEntity);
    const history = await repository.find(
      input.userId
        ? { user: input.userId }
        : { guestSessionId: input.guestSessionId },
      {
        orderBy: { viewedAt: 'desc' },
        limit: input.limit,
      }
    );
    const productIds = history.map((entry) => entry.product.id);

    if (productIds.length === 0) {
      return [];
    }

    return this.storefrontProductQueryRepository.findPublicByIds(productIds);
  }

  async listTrendingProducts(input: {
    limit: number;
    windowDays?: number;
  }): Promise<PublicProductListItem[]> {
    const entityManager = this.entityManager.fork();
    const lookbackStart = new Date(
      Date.now() - ((input.windowDays ?? 14) * 24 * 60 * 60 * 1000)
    );
    const candidateLimit = Math.max(input.limit * 4, input.limit);
    const rows = await entityManager.getConnection().execute<Array<{
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
      [lookbackStart, ProductState.ACTIVE, candidateLimit]
    );
    const productIds = rows.map((row) => row.product_id);

    if (productIds.length === 0) {
      return [];
    }

    const products = await this.storefrontProductQueryRepository.findPublicByIds(productIds);

    return products
      .filter((product) => product.availability.inStock)
      .slice(0, input.limit);
  }

  async listAlsoViewedProducts(input: {
    shopSlug: string;
    productSlug: string;
    limit: number;
    windowDays?: number;
  }): Promise<PublicProductListItem[]> {
    const product = await this.getPublicProductBySlugsUseCase.execute(
      input.shopSlug,
      input.productSlug
    );

    if (!product?.id) {
      return [];
    }

    const entityManager = this.entityManager.fork();
    const lookbackStart = new Date(
      Date.now() - ((input.windowDays ?? 30) * 24 * 60 * 60 * 1000)
    );
    const candidateLimit = Math.max(input.limit * 4, input.limit);
    const rows = await entityManager.getConnection().execute<Array<{
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
      [product.id, lookbackStart, lookbackStart, ProductState.ACTIVE, candidateLimit]
    );
    const productIds = rows.map((row) => row.product_id);

    if (productIds.length === 0) {
      return [];
    }

    const products = await this.storefrontProductQueryRepository.findPublicByIds(productIds);

    return products
      .filter((relatedProduct) => relatedProduct.availability.inStock)
      .slice(0, input.limit);
  }
}
