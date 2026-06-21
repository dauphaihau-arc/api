import { Injectable } from '@nestjs/common';
import { PublicProductViewHistoryRepository } from '../ports/public-product-view-history.repository';
import { StorefrontProductQueryRepository } from '../ports/storefront-product-query.repository';
import type { PublicProductListItem } from '../product.types';
import { GetPublicProductBySlugsUseCase } from '../use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';

@Injectable()
export class PublicProductViewHistoryService {
  constructor(
    private readonly publicProductViewHistoryRepository: PublicProductViewHistoryRepository,
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase,
    private readonly storefrontProductQueryRepository: StorefrontProductQueryRepository,
  ) {}

  async recordView(input: {
    shopSlug: string;
    productSlug: string;
    userId?: string;
    guestSessionId?: string;
  }): Promise<void> {
    const product = await this.getPublicProductBySlugsUseCase.execute(
      input.shopSlug,
      input.productSlug,
    );

    if (!product?.id) {
      return;
    }

    await this.publicProductViewHistoryRepository.recordView({
      productId: product.id,
      userId: input.userId,
      guestSessionId: input.guestSessionId,
    });
  }

  async listRecentViews(input: {
    userId?: string;
    guestSessionId?: string;
    limit: number;
  }): Promise<PublicProductListItem[]> {
    return this.listProducts(
      await this.publicProductViewHistoryRepository.listRecentViewProductIds(input),
    );
  }

  async listTrendingProducts(input: {
    limit: number;
    windowDays?: number;
  }): Promise<PublicProductListItem[]> {
    return this.listVisibleProducts(
      await this.publicProductViewHistoryRepository.listTrendingProductIds(input),
      input.limit,
    );
  }

  async listAlsoViewedProducts(input: {
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
      await this.publicProductViewHistoryRepository.listAlsoViewedProductIds({
        productId: product.id,
        limit: input.limit,
        windowDays: input.windowDays,
      }),
      input.limit,
    );
  }

  private async listProducts(productIds: string[]): Promise<PublicProductListItem[]> {
    if (productIds.length === 0) {
      return [];
    }

    return this.storefrontProductQueryRepository.findPublicByIds(productIds);
  }

  private async listVisibleProducts(
    productIds: string[],
    limit: number,
  ): Promise<PublicProductListItem[]> {
    const products = await this.listProducts(productIds);

    return products
      .filter((product) => product.availability.inStock)
      .slice(0, limit);
  }
}
