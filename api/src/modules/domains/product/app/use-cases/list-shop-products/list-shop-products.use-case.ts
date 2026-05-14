import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
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
    const result = await this.productRepository.listByShop({
      shopId: query.shopId,
      page: query.page,
      limit: query.limit,
      state: query.state,
      categoryId: query.categoryId,
      search: query.search?.trim() || undefined,
    });

    return {
      items: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.meta.total),
    };
  }
}
