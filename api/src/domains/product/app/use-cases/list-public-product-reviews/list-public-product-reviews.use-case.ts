import { Injectable } from '@nestjs/common';
import {
  PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT,
  PRODUCT_PUBLIC_LIST_MAX_LIMIT,
  type PublicProductReviewListResult,
  type PublicProductReviewSortOrder,
} from '../../product.types';
import { PublicProductReviewQueryRepository } from '../../ports/public-product-review-query.repository';

@Injectable()
export class ListPublicProductReviewsUseCase {
  constructor(
    private readonly publicProductReviewQueryRepository: PublicProductReviewQueryRepository,
  ) {}

  async execute(input: {
    shopSlug: string;
    productSlug: string;
    page?: number;
    limit?: number;
    sort?: PublicProductReviewSortOrder;
    rating?: 1 | 2 | 3 | 4 | 5;
    hasImages?: boolean;
    hasComment?: boolean;
  }): Promise<PublicProductReviewListResult | null> {
    return this.publicProductReviewQueryRepository.listPublicByProductSlug({
      shopSlug: input.shopSlug,
      productSlug: input.productSlug,
      page: Math.max(1, input.page ?? 1),
      limit: Math.min(
        PRODUCT_PUBLIC_LIST_MAX_LIMIT,
        Math.max(1, input.limit ?? PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT),
      ),
      sort: input.sort ?? 'newest',
      rating: input.rating,
      hasImages: input.hasImages,
      hasComment: input.hasComment,
    });
  }
}
