import type { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import type { ProductReviewImageEntity } from '../../infra/persistence/mikro-orm/entities/product-review-image.entity';
import type { ProductReviewImageVariantEntity } from '../../infra/persistence/mikro-orm/entities/product-review-image-variant.entity';

export abstract class ReviewImageVariantGenerationRepository {
  abstract findReviewImageForVariantGeneration(
    reviewImageId: string,
  ): Promise<ProductReviewImageEntity | null>;

  abstract createVariant(input: {
    image: ProductReviewImageEntity;
    variant: ProductImageVariant;
    storageKey: string;
    width?: number;
    height?: number;
    format?: string;
  }): ProductReviewImageVariantEntity;

  abstract removeVariant(variant: ProductReviewImageVariantEntity): void;

  abstract flush(): Promise<void>;
}
