import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderStatus } from '~/modules/domains/order/domain/enums/order-status.enum';
import { StorefrontProductQueryRepository } from '../ports/storefront-product-query.repository';
import type { PublicProductListItem } from '../product.types';
import { GetPublicProductBySlugsUseCase } from '../use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { ProductState } from '../../domain/enums/product-state.enum';

@Injectable()
export class PublicProductOrderHistoryService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase,
    private readonly storefrontProductQueryRepository: StorefrontProductQueryRepository
  ) {}

  async listBestSellingProducts(input: {
    limit: number;
    windowDays?: number;
  }): Promise<PublicProductListItem[]> {
    const entityManager = this.entityManager.fork();
    const lookbackStart = new Date(
      Date.now() - ((input.windowDays ?? 180) * 24 * 60 * 60 * 1000)
    );
    const candidateLimit = Math.max(input.limit * 4, input.limit);
    const qualifyingStatuses = [OrderStatus.PAID, OrderStatus.COMPLETED];

    const rows = await entityManager.getConnection().execute<Array<{
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
        qualifyingStatuses[0],
        qualifyingStatuses[1],
        lookbackStart,
        ProductState.ACTIVE,
        candidateLimit,
      ]
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

  async listFrequentlyBoughtTogether(input: {
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
      Date.now() - ((input.windowDays ?? 180) * 24 * 60 * 60 * 1000)
    );
    const candidateLimit = Math.max(input.limit * 4, input.limit);
    const qualifyingStatuses = [OrderStatus.PAID, OrderStatus.COMPLETED];
    const rows = await entityManager.getConnection().execute<Array<{
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
        product.id,
        qualifyingStatuses[0],
        qualifyingStatuses[1],
        lookbackStart,
        ProductState.ACTIVE,
        candidateLimit,
      ]
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
