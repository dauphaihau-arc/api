import type { EntityManager } from '@mikro-orm/postgresql';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';

export interface ProductReference {
  id: string;
  publicId: string;
}

export async function loadProductReferences(
  entityManager: EntityManager,
  productIds: readonly string[],
): Promise<Map<string, ProductReference>> {
  const uniqueProductIds = [...new Set(productIds)];

  if (uniqueProductIds.length === 0) {
    return new Map();
  }

  const products = await entityManager.getRepository(ProductEntity).find(
    { id: { $in: uniqueProductIds } },
    { fields: ['id', 'publicId'] },
  );

  return new Map(products.map((product) => [product.id, {
    id: product.id,
    publicId: product.publicId,
  }]));
}

export function selectProductReferences(
  productIds: readonly string[],
  referencesById: ReadonlyMap<string, ProductReference>,
): ProductReference[] {
  return productIds.flatMap((productId) => {
    const reference = referencesById.get(productId);
    return reference ? [reference] : [];
  });
}
