import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/platform/application/pagination';
import { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type {
  ListShopProductsInput,
  ShopProductListResult,
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
  constructor(
    private readonly productRepository: SellerProductQueryRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(query: ListShopProductsQuery): Promise<ShopProductListResult> {
    const normalizedSearch = query.search?.trim() || undefined;
    let categoryId: string | undefined;

    if (query.categoryId) {
      const category = await this.categoryRepository.findByPublicId(query.categoryId);

      if (!category) {
        return {
          items: [],
          meta: buildPaginationMeta(query.page, query.limit, 0),
          stateCounts: {
            all: 0,
            active: 0,
            inactive: 0,
            draft: 0,
          },
        };
      }

      categoryId = category.id;
    }

    return this.productRepository.listByShop({
      shopId: query.shopId,
      page: query.page,
      limit: query.limit,
      state: query.state,
      categoryId,
      search: normalizedSearch,
    });
  }
}
