import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ReviewImageVariantGenerationRepository } from '../../../../app/ports/review-image-variant-generation.repository';
import { ProductReviewImageEntity } from '../entities/product-review-image.entity';
import { ProductReviewImageVariantEntity } from '../entities/product-review-image-variant.entity';

@Injectable()
export class MikroOrmReviewImageVariantGenerationRepository
implements ReviewImageVariantGenerationRepository {
  private activeEntityManager?: EntityManager;

  constructor(private readonly entityManager: EntityManager) {}

  async findReviewImageForVariantGeneration(reviewImageId: string) {
    const entityManager = this.entityManager.fork();
    this.activeEntityManager = entityManager;

    return entityManager.getRepository(ProductReviewImageEntity).findOne(
      { id: reviewImageId },
      {
        populate: ['variants'],
      },
    );
  }

  createVariant(input: {
    image: ProductReviewImageVariantEntity['image'];
    variant: ProductReviewImageVariantEntity['variant'];
    storageKey: string;
    width?: number;
    height?: number;
    format?: string;
  }) {
    const entityManager = this.requireEntityManager();
    const variantEntity = entityManager.create(ProductReviewImageVariantEntity, input);
    entityManager.persist(variantEntity);

    return variantEntity;
  }

  removeVariant(variant: ProductReviewImageVariantEntity): void {
    this.requireEntityManager().remove(variant);
  }

  async flush(): Promise<void> {
    await this.requireEntityManager().flush();
  }

  private requireEntityManager(): EntityManager {
    if (!this.activeEntityManager) {
      throw new Error('Review image variant generation entity manager is not initialized.');
    }

    return this.activeEntityManager;
  }
}
