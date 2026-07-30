import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductImageVariantGenerationRepository } from '../../../../app/ports/product-image-variant-generation.repository';
import { ProductImageVariantEntity } from '../entities/product-image-variant.entity';
import { ProductEntity } from '../entities/product.entity';

@Injectable()
export class MikroOrmProductImageVariantGenerationRepository
implements ProductImageVariantGenerationRepository {
  private activeEntityManager?: EntityManager;

  constructor(private readonly entityManager: EntityManager) {}

  async findProductForVariantGeneration(productId: string) {
    const entityManager = this.entityManager.fork();
    this.activeEntityManager = entityManager;

    return entityManager.getRepository(ProductEntity).findOne(
      { id: productId },
      {
        populate: ['shop', 'images', 'images.variants'],
      },
    );
  }

  createVariant(input: {
    image: ProductImageVariantEntity['image'];
    variant: ProductImageVariantEntity['variant'];
    storageKey: string;
    width?: number;
    height?: number;
    format?: string;
  }) {
    const entityManager = this.requireEntityManager();
    const variantEntity = entityManager.create(ProductImageVariantEntity, input);
    entityManager.persist(variantEntity);

    return variantEntity;
  }

  removeVariant(variant: ProductImageVariantEntity): void {
    this.requireEntityManager().remove(variant);
  }

  async flush(): Promise<void> {
    await this.requireEntityManager().flush();
  }

  private requireEntityManager(): EntityManager {
    if (!this.activeEntityManager) {
      throw new Error('Product image variant generation entity manager is not initialized.');
    }

    return this.activeEntityManager;
  }
}
