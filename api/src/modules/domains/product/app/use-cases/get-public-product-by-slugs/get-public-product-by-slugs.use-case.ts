import { Injectable } from '@nestjs/common';
import { ProductRepository } from '../../ports/product.repository';
import type { PublicProductDetail } from '../../product.types';

@Injectable()
export class GetPublicProductBySlugsUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

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
