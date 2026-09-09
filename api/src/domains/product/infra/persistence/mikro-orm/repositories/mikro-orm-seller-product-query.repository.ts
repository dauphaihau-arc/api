import { LoadStrategy } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/platform/application/pagination';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { SellerProductQueryRepository } from '../../../../app/ports/seller-product-query.repository';
import type {
  ListShopProductsInput,
  ProductDraftSummary,
  ProductMutationTarget,
  ShopProductListResult,
} from '../../../../app/product.types';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { toProductDraftSummary } from '../../../projection/product-draft-summary.projector';

type ProductStateCountRow = {
  state: ProductState;
  count: string | number;
};

type ProductIdRow = {
  id: string;
};

@Injectable()
export class MikroOrmSellerProductQueryRepository
implements SellerProductQueryRepository {
  private static readonly summaryPopulate = [
    'shop',
    'category',
    'images',
    'images.variants',
    'attributeValues',
    'attributeValues.categoryAttribute',
    'attributeValues.selectedOption',
    'variants',
    'options',
    'options.values',
    'variants.selections',
    'variants.selections.productOption',
    'variants.selections.productOptionValue',
    'inventoryRecords',
    'inventoryRecords.productVariant',
    'inventoryRecords.prices',
    'shippingProfiles',
    'shippingProfiles.destinations',
  ] as const;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async findById(id: string): Promise<ProductDraftSummary | null> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const product = await repository.findOne(
      { id },
      {
        populate: [...MikroOrmSellerProductQueryRepository.summaryPopulate],
        strategy: LoadStrategy.SELECT_IN,
      },
    );

    return product ? toProductDraftSummary(product, this.storageService) : null;
  }

  async findMutationTargetById(id: string): Promise<ProductMutationTarget | null> {
    const [row] = await this.entityManager.fork().getConnection().execute<Array<{
      id: string
      shop_id: string
      product_version: number
    }>>(
      `
        select id, shop_id, product_version
        from products
        where id = ?
      `,
      [id],
    );

    return row
      ? {
        id: row.id,
        shopId: row.shop_id,
        productVersion: row.product_version,
      }
      : null;
  }

  async listByShop(
    input: ListShopProductsInput,
  ): Promise<ShopProductListResult> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const baseFilter = this.buildShopListBaseFilter(input);
    const pageFilter = this.buildShopListPageFilter(baseFilter, input.state);
    const offset = (input.page - 1) * input.limit;

    const [countRows, pageRows] = await Promise.all([
      entityManager.getConnection().execute<ProductStateCountRow[]>(
        `
          select state, count(*)::int as count
          from products
          where ${baseFilter.where}
          group by state
        `,
        baseFilter.params,
      ),
      entityManager.getConnection().execute<ProductIdRow[]>(
        `
          select id
          from products
          where ${pageFilter.where}
          order by updated_at desc, id desc
          limit ?
          offset ?
        `,
        [
          ...pageFilter.params,
          input.limit,
          offset,
        ],
      ),
    ]);

    const countsByState = this.buildCountsByState(countRows);

    const total = input.state
      ? countsByState[input.state]
      : this.countListableProducts(countsByState);

    const productIds = pageRows.map((row) => row.id);

    if (productIds.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, total),
        stateCounts: this.toStateCounts(countsByState),
      };
    }

    const products = await repository.find(
      { id: { $in: productIds } },
      {
        populate: [...MikroOrmSellerProductQueryRepository.summaryPopulate],
        strategy: LoadStrategy.SELECT_IN,
      },
    );

    const productOrder = new Map(
      productIds.map((productId, index) => [productId, index]),
    );

    const orderedProducts = products.sort(
      (left, right) =>
        (productOrder.get(left.id) ?? 0) - (productOrder.get(right.id) ?? 0),
    );

    return {
      items: orderedProducts.map((product) => toProductDraftSummary(product, this.storageService)),
      meta: buildPaginationMeta(input.page, input.limit, total),
      stateCounts: this.toStateCounts(countsByState),
    };
  }

  async findByShopIdAndSlug(
    shopId: string,
    slug: string,
  ): Promise<ProductDraftSummary | null> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const product = await repository.findOne(
      { shop: shopId, slug },
      {
        populate: [...MikroOrmSellerProductQueryRepository.summaryPopulate],
        strategy: LoadStrategy.SELECT_IN,
      },
    );

    return product ? toProductDraftSummary(product, this.storageService) : null;
  }

  async listSlugsByShopIdAndPrefix(
    shopId: string,
    slugPrefix: string,
  ): Promise<string[]> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const products = await repository.find(
      {
        shop: shopId,
        $or: [
          { slug: slugPrefix },
          { slug: { $like: `${slugPrefix}-%` } },
        ],
      },
      { fields: ['slug'] },
    );

    return products.map((product) => product.slug);
  }

  private buildShopListBaseFilter(
    input: ListShopProductsInput,
  ): { where: string; params: Array<string> } {
    const clauses = ['shop_id = ?'];
    const params = [input.shopId];

    if (input.categoryId) {
      clauses.push('category_id = ?');
      params.push(input.categoryId);
    }

    const normalizedSearch = input.search?.trim().toLowerCase();

    if (normalizedSearch) {
      clauses.push(`
        lower(
          coalesce(title, '')
          || ' '
          || coalesce(slug, '')
          || ' '
          || coalesce(description, '')
        ) like ? escape '\\'
      `);
      params.push(`%${this.escapeLikePattern(normalizedSearch)}%`);
    }

    return {
      where: clauses.join('\n            and '),
      params,
    };
  }

  private buildShopListPageFilter(
    baseFilter: { where: string; params: Array<string> },
    requestedState?: ProductState,
  ): { where: string; params: Array<string> } {
    if (requestedState) {
      return {
        where: `${baseFilter.where}\n            and state = ?`,
        params: [...baseFilter.params, requestedState],
      };
    }

    return {
      where: `${baseFilter.where}\n            and state <> ?`,
      params: [...baseFilter.params, ProductState.REMOVED],
    };
  }

  private buildCountsByState(
    rows: ProductStateCountRow[],
  ): Record<ProductState, number> {
    const counts = {
      [ProductState.ACTIVE]: 0,
      [ProductState.INACTIVE]: 0,
      [ProductState.DRAFT]: 0,
      [ProductState.REMOVED]: 0,
      [ProductState.UNAVAILABLE]: 0,
    };

    rows.forEach((row) => {
      counts[row.state] = Number(row.count);
    });

    return counts;
  }

  private toStateCounts(
    countsByState: Record<ProductState, number>,
  ): ShopProductListResult['stateCounts'] {
    return {
      all: this.countListableProducts(countsByState),
      active: countsByState[ProductState.ACTIVE],
      inactive: countsByState[ProductState.INACTIVE],
      draft: countsByState[ProductState.DRAFT],
    };
  }

  private countListableProducts(
    countsByState: Record<ProductState, number>,
  ): number {
    return Object.entries(countsByState)
      .filter(([state]) => state !== ProductState.REMOVED)
      .reduce((total, [, count]) => total + count, 0);
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
  }
}
