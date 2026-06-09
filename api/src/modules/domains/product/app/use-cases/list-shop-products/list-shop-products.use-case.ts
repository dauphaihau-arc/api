import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductRepository } from '../../ports/product.repository';
import type {
  ListShopProductsInput,
  ShopProductListResult
} from '../../product.types';

export interface ListShopProductsQuery {
  shopId: string;
  page: number;
  limit: number;
  state?: ListShopProductsInput['state'];
  categoryId?: string;
  search?: string;
}

@Injectable()
export class ListShopProductsUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(query: ListShopProductsQuery): Promise<ShopProductListResult> {
    const normalizedSearch = query.search?.trim() || undefined;
    const [result, allResult, activeResult, inactiveResult, draftResult] = await Promise.all([
      this.productRepository.listByShop({
        shopId: query.shopId,
        page: query.page,
        limit: query.limit,
        state: query.state,
        categoryId: query.categoryId,
        search: normalizedSearch,
      }),
      this.productRepository.listByShop({
        shopId: query.shopId,
        page: 1,
        limit: 1,
        categoryId: query.categoryId,
        search: normalizedSearch,
      }),
      this.productRepository.listByShop({
        shopId: query.shopId,
        page: 1,
        limit: 1,
        state: ProductState.ACTIVE,
        categoryId: query.categoryId,
        search: normalizedSearch,
      }),
      this.productRepository.listByShop({
        shopId: query.shopId,
        page: 1,
        limit: 1,
        state: ProductState.INACTIVE,
        categoryId: query.categoryId,
        search: normalizedSearch,
      }),
      this.productRepository.listByShop({
        shopId: query.shopId,
        page: 1,
        limit: 1,
        state: ProductState.DRAFT,
        categoryId: query.categoryId,
        search: normalizedSearch,
      }),
    ]);

    return {
      items: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.meta.total),
      stateCounts: {
        all: allResult.meta.total,
        active: activeResult.meta.total,
        inactive: inactiveResult.meta.total,
        draft: draftResult.meta.total,
      },
    };
  }
}
