import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/platform/application/pagination';
import { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type { PublicProductListResult } from '../../product.types';
import {
  type ListPublicProductsQuery,
  resolveQueryCategoryIds,
  toListPublicProductsInput,
} from './list-public-products.query';

@Injectable()
export class ListPublicProductsUseCase {
  constructor(
    private readonly productRepository: StorefrontProductQueryRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(query: ListPublicProductsQuery): Promise<PublicProductListResult> {
    const categoryIds = await resolveQueryCategoryIds(
      this.categoryRepository,
      query.categoryId,
    );

    if (query.categoryId && categoryIds?.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(query.page, query.limit, 0),
      };
    }

    const result = await this.productRepository.listPublic(
      toListPublicProductsInput(query, categoryIds),
    );

    return {
      items: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.meta.total),
    };
  }
}
