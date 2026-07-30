import { Injectable } from '@nestjs/common';
import {
  PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT,
  PRODUCT_PUBLIC_LIST_MAX_LIMIT,
  type PublicProductReviewImageListResult,
} from '../../product.types';
import { PublicProductReviewQueryRepository } from '../../ports/public-product-review-query.repository';

@Injectable()
export class ListPublicProductReviewImagesUseCase {
  constructor(
    private readonly publicProductReviewQueryRepository: PublicProductReviewQueryRepository,
  ) {}

  async execute(input: {
    shopSlug: string;
    productSlug: string;
    limit?: number;
    cursor?: string;
  }): Promise<PublicProductReviewImageListResult | null> {
    return this.publicProductReviewQueryRepository.listPublicImagesByProductSlug({
      shopSlug: input.shopSlug,
      productSlug: input.productSlug,
      limit: Math.min(
        PRODUCT_PUBLIC_LIST_MAX_LIMIT,
        Math.max(1, input.limit ?? PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT),
      ),
      cursor: input.cursor,
    });
  }
}
