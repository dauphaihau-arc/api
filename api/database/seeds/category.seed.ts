import { EntityManager } from '@mikro-orm/postgresql';
import { CategoryAttributeOptionEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/modules/domains/category/infra/persistence/entities/category.entity';
import {
  categorySeedData,
  type CategorySeedAttribute,
  type CategorySeedNode,
} from './category.data';

async function syncCategoryAttributeOptions(
  em: EntityManager,
  attribute: CategoryAttributeEntity,
  options: string[]
): Promise<void> {
  for (const [index, value] of options.entries()) {
    const option =
      (await em.findOne(CategoryAttributeOptionEntity, {
        categoryAttribute: attribute,
        value,
      })) ??
      em.create(CategoryAttributeOptionEntity, {
        categoryAttribute: attribute,
        value,
        rank: index + 1,
      });

    option.rank = index + 1;
    em.persist(option);
  }

  await em.flush();
}

async function syncCategoryAttributes(
  em: EntityManager,
  category: CategoryEntity,
  attributes: CategorySeedAttribute[]
): Promise<void> {
  for (const [index, attributeSeed] of attributes.entries()) {
    const attribute =
      (await em.findOne(CategoryAttributeEntity, {
        category,
        name: attributeSeed.name,
      })) ??
      em.create(CategoryAttributeEntity, {
        category,
        name: attributeSeed.name,
        inputType: 'select',
        isRequired: false,
        rank: index + 1,
      });

    attribute.rank = index + 1;
    em.persist(attribute);
    await em.flush();
    await syncCategoryAttributeOptions(em, attribute, attributeSeed.options);
  }
}

async function upsertCategory(
  em: EntityManager,
  node: CategorySeedNode,
  parent?: CategoryEntity
): Promise<void> {
  const category =
    (await em.findOne(CategoryEntity, {
      name: node.name,
      parent: parent ?? null,
    })) ??
    em.create(CategoryEntity, {
      name: node.name,
      parent,
      rank: node.rank,
      imageStorageKey: node.imageStorageKey,
    });

  category.rank = node.rank;
  category.imageStorageKey = node.imageStorageKey;
  em.persist(category);
  await em.flush();

  await syncCategoryAttributes(em, category, node.attributes ?? []);

  for (const child of node.children ?? []) {
    await upsertCategory(em, child, category);
  }
}

export async function seedCategories(em: EntityManager): Promise<void> {
  for (const categorySeed of categorySeedData) {
    await upsertCategory(em, categorySeed);
  }
}
