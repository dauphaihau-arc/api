import { Injectable } from '@nestjs/common';
import { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type { PublicProductDetail } from '../../product.types';

@Injectable()
export class GetPublicProductBySlugsUseCase {
  constructor(private readonly productRepository: StorefrontProductQueryRepository) {}

  async execute(
    shopSlug: string,
    productSlug: string
  ): Promise<PublicProductDetail | null> {
    return this.productRepository.findPublicByShopSlugAndProductSlug(
      shopSlug,
      productSlug
    );
  }
}
