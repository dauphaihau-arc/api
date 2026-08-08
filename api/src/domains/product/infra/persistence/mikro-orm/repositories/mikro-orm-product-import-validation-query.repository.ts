import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import {
  ProductImportValidationQueryRepository,
} from '../../../../app/ports/product-import-validation-query.repository';
import type { ResolvedImportCategory } from '../../../../app/ports/product-import.types';
import { ProductInventoryEntity } from '../entities/product-inventory.entity';

@Injectable()
export class MikroOrmProductImportValidationQueryRepository implements ProductImportValidationQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async resolveCategoryPath(path: string): Promise<ResolvedImportCategory[]> {
    const entityManager = this.entityManager.fork();

    const categories = await entityManager.find(
      CategoryEntity,
      {},
      { populate: ['parent'], orderBy: { rank: 'asc' } },
    );

    const byId = new Map(categories.map((category) => [category.id, category]));
    const normalizedTarget = normalizeCategoryPath(path);

    return categories
      .map((category) => ({
        id: category.id,
        path: buildPath(category, byId),
      }))
      .filter((category) => normalizeCategoryPath(category.path) === normalizedTarget);
  }

  async skuExists(shopId: string, sku: string): Promise<boolean> {
    const count = await this.entityManager.fork().count(ProductInventoryEntity, {
      shop: shopId,
      sku,
    });

    return count > 0;
  }
}

function buildPath(category: CategoryEntity, byId: Map<string, CategoryEntity>) {
  const path: string[] = [];
  let current: CategoryEntity | undefined = category;

  while (current) {
    path.unshift(current.name);
    current = current.parent ? byId.get(current.parent.id) : undefined;
  }

  return path.join(' > ');
}

function normalizeCategoryPath(path: string) {
  return path
    .split('>')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join(' > ');
}
