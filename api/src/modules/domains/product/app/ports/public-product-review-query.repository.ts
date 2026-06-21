import type {
  ListPublicProductReviewImagesInput,
  ListPublicProductReviewsInput,
  PublicProductReviewImageListResult,
  PublicProductReviewListResult,
} from '../product.types';

export abstract class PublicProductReviewQueryRepository {
  abstract listPublicByProductSlug(
    input: ListPublicProductReviewsInput,
  ): Promise<PublicProductReviewListResult | null>;

  abstract listPublicImagesByProductSlug(
    input: ListPublicProductReviewImagesInput,
  ): Promise<PublicProductReviewImageListResult | null>;
}
