import { Injectable } from '@nestjs/common';
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
  constructor(private readonly productRepository: SellerProductQueryRepository) {}

  async execute(query: ListShopProductsQuery): Promise<ShopProductListResult> {
    const normalizedSearch = query.search?.trim() || undefined;

    return this.productRepository.listByShop({
      shopId: query.shopId,
      page: query.page,
      limit: query.limit,
      state: query.state,
      categoryId: query.categoryId,
      search: normalizedSearch,
    });
  }
}
