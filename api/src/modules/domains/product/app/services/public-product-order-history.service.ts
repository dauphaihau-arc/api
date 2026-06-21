import { Injectable } from '@nestjs/common';
import { PublicProductOrderHistoryRepository } from '../ports/public-product-order-history.repository';
import { StorefrontProductQueryRepository } from '../ports/storefront-product-query.repository';
import type { PublicProductListItem } from '../product.types';
import { GetPublicProductBySlugsUseCase } from '../use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';

@Injectable()
export class PublicProductOrderHistoryService {
  constructor(
    private readonly publicProductOrderHistoryRepository: PublicProductOrderHistoryRepository,
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase,
    private readonly storefrontProductQueryRepository: StorefrontProductQueryRepository,
  ) {}

  async listBestSellingProducts(input: {
    limit: number;
    windowDays?: number;
  }): Promise<PublicProductListItem[]> {
    return this.listVisibleProducts(
      await this.publicProductOrderHistoryRepository.listBestSellingProductIds(input),
      input.limit,
    );
  }

  async listFrequentlyBoughtTogether(input: {
    shopSlug: string;
    productSlug: string;
    limit: number;
    windowDays?: number;
  }): Promise<PublicProductListItem[]> {
    const product = await this.getPublicProductBySlugsUseCase.execute(
      input.shopSlug,
      input.productSlug,
    );

    if (!product?.id) {
      return [];
    }

    return this.listVisibleProducts(
      await this.publicProductOrderHistoryRepository.listFrequentlyBoughtTogetherProductIds({
        productId: product.id,
        limit: input.limit,
        windowDays: input.windowDays,
      }),
      input.limit,
    );
  }

  private async listVisibleProducts(
    productIds: string[],
    limit: number,
  ): Promise<PublicProductListItem[]> {
    if (productIds.length === 0) {
      return [];
    }

    const products = await this.storefrontProductQueryRepository.findPublicByIds(productIds);

    return products
      .filter((product) => product.availability.inStock)
      .slice(0, limit);
  }
}
