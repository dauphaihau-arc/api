import type { EntityManager } from '@mikro-orm/postgresql';
import { basename, extname } from 'node:path';
import { toSlug } from '~/common/utils/slugify';
import { CategoryAttributeOptionEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/modules/domains/category/infra/persistence/entities/category.entity';
import {
  buildStorageObjectKey,
  resolveStorageEnvironmentSegment
} from '~/modules/shared/storage/app/storage-key-builder';
import {
  categorySeedData,
  type CategorySeedAttribute,
  type CategorySeedNode
} from './category.data';

function countCategoryNodes(nodes: CategorySeedNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countCategoryNodes(node.children ?? []),
    0
  );
}

function buildCategoryImageStorageKey(
  categoryId: string,
  imageFilename: string
): string {
  const normalizedFilename = basename(imageFilename.trim());
  const extension = extname(normalizedFilename).replace(/^\./, '').toLowerCase();
  const filenameWithoutExtension = normalizedFilename.slice(
    0,
    normalizedFilename.length - extension.length - 1
  );

  if (!extension || !filenameWithoutExtension) {
    throw new Error(`Invalid category image filename "${imageFilename}".`);
  }

  return buildStorageObjectKey({
    env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
    visibility: 'public',
    path: [{ domain: 'categories', id: categoryId }],
    collection: 'images',
    assetPath: ['original'],
    extension,
    filename: filenameWithoutExtension,
  });
}

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
        key: attributeSeed.key,
      })) ??
      em.create(CategoryAttributeEntity, {
        category,
        key: attributeSeed.key || toSlug(attributeSeed.name).replaceAll('-', '_'),
        name: attributeSeed.name,
        inputType: 'select',
        isRequired: false,
        rank: index + 1,
      });

    attribute.key = attributeSeed.key || toSlug(attributeSeed.name).replaceAll('-', '_');
    attribute.rank = index + 1;
    attribute.name = attributeSeed.name;
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
    });

  category.rank = node.rank;
  category.featuredFacetKeys = node.featuredFacetKeys;
  em.persist(category);
  await em.flush();
  category.imageStorageKey = node.imageFilename
    ? buildCategoryImageStorageKey(category.id, node.imageFilename)
    : undefined;
  em.persist(category);
  await em.flush();

  await syncCategoryAttributes(em, category, node.attributes ?? []);

  for (const child of node.children ?? []) {
    await upsertCategory(em, child, category);
  }
}

export async function seedCategories(em: EntityManager): Promise<void> {
  const totalCategories = countCategoryNodes(categorySeedData);
  console.log(`[seed][categories] Upserting ${totalCategories} categories`);

  for (const categorySeed of categorySeedData) {
    await upsertCategory(em, categorySeed);
  }

  console.log('[seed][categories] Categories complete');
}
