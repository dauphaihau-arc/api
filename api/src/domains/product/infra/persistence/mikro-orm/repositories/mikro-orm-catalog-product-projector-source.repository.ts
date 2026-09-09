import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CatalogProductProjectorSourceRepository } from '../../../../app/ports/catalog-product-projector-source.repository';
import { ProductEntity } from '../entities/product.entity';

@Injectable()
export class MikroOrmCatalogProductProjectorSourceRepository
implements CatalogProductProjectorSourceRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findById(productId: string) {
    return this.entityManager.fork().getRepository(ProductEntity).findOne(
      { id: productId },
      {
        populate: [
          'shop',
          'category',
          'images',
          'images.variants',
          'variants',
          'options',
          'options.values',
          'variants.selections',
          'variants.selections.productOption',
          'variants.selections.productOptionValue',
          'attributeValues',
          'attributeValues.categoryAttribute',
          'attributeValues.selectedOption',
          'inventoryRecords',
          'inventoryRecords.productVariant',
          'inventoryRecords.prices',
          'shippingProfiles',
          'shippingProfiles.destinations',
        ],
      },
    );
  }
}
