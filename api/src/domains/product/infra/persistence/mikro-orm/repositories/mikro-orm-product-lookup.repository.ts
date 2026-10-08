import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductLookupRepository } from '../../../../app/ports/product-lookup.repository';
import { ProductEntity } from '../entities/product.entity';

@Injectable()
export class MikroOrmProductLookupRepository implements ProductLookupRepository {
  constructor(private readonly entityManager: EntityManager) {}
  async findInternalIdByPublicId(publicId: string): Promise<string | null> {
    const product = await this.entityManager.fork().getRepository(ProductEntity).findOne({ publicId }, { fields: ['id'] });
    return product?.id ?? null;
  }
  async findInternalIdsByPublicIds(publicIds: readonly string[]): Promise<readonly (string | null)[]> {
    if (!publicIds.length) return [];
    const products = await this.entityManager.fork().getRepository(ProductEntity).find(
      { publicId: { $in: [...new Set(publicIds)] } }, { fields: ['id', 'publicId'] },
    );
    const byPublicId = new Map(products.map((product) => [product.publicId, product.id]));
    return publicIds.map((publicId) => byPublicId.get(publicId) ?? null);
  }
}
