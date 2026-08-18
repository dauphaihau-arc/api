import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { CategoryQueryRepository } from '../app/ports/category-query.repository';
import type {
  CategorySuggestion,
  CategorySummary,
} from '../app/category.types';
import { CategoryEntity } from './persistence/entities/category.entity';
import { toCategorySummary } from './category-summary.projector';

type CategorySubtreeRow = {
  category_id: string;
  parent_id: string | null;
  category_name: string;
  category_rank: number;
  depth: number;
  image_storage_key: string | null;
  featured_facet_keys: string[] | string | null;
  attribute_id: string | null;
  attribute_key: string | null;
  attribute_name: string | null;
  attribute_input_type: string | null;
  attribute_is_required: boolean | null;
  attribute_rank: number | null;
  option_id: string | null;
  option_value: string | null;
  option_rank: number | null;
};

@Injectable()
export class MikroOrmCategoryQueryRepository implements CategoryQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async findSelfAndDescendantIds(id: string): Promise<string[] | null> {
    const rows = await this.entityManager.getConnection().execute<Array<{ id: string }>>(
      `
        with recursive category_tree as (
          select id
          from categories
          where id = ?

          union all

          select child.id
          from categories child
          inner join category_tree parent on child.parent_id = parent.id
        )
        select id
        from category_tree
      `,
      [id],
    );

    return rows.length > 0
      ? rows.map((row) => row.id)
      : null;
  }

  async findSelfAndDescendants(id: string): Promise<CategorySummary[] | null> {
    const rows = await this.entityManager.getConnection().execute<CategorySubtreeRow[]>(
      `
        with recursive category_tree as (
          select
            id,
            parent_id,
            name,
            rank,
            image_storage_key,
            featured_facet_keys,
            0 as depth
          from categories
          where id = ?

          union all

          select
            child.id,
            child.parent_id,
            child.name,
            child.rank,
            child.image_storage_key,
            child.featured_facet_keys,
            parent.depth + 1
          from categories child
          inner join category_tree parent on child.parent_id = parent.id
        )
        select
          category_tree.id as category_id,
          category_tree.parent_id,
          category_tree.name as category_name,
          category_tree.rank as category_rank,
          category_tree.depth,
          category_tree.image_storage_key,
          category_tree.featured_facet_keys,
          category_attributes.id as attribute_id,
          category_attributes.key as attribute_key,
          category_attributes.name as attribute_name,
          category_attributes.input_type as attribute_input_type,
          category_attributes.is_required as attribute_is_required,
          category_attributes.rank as attribute_rank,
          category_attribute_options.id as option_id,
          category_attribute_options.value as option_value,
          category_attribute_options.rank as option_rank
        from category_tree
        left join category_attributes
          on category_attributes.category_id = category_tree.id
        left join category_attribute_options
          on category_attribute_options.category_attribute_id = category_attributes.id
        order by
          category_tree.depth asc,
          category_tree.rank asc,
          category_tree.name asc,
          category_attributes.rank asc nulls last,
          category_attributes.name asc nulls last,
          category_attribute_options.rank asc nulls last,
          category_attribute_options.value asc nulls last
      `,
      [id],
    );

    if (rows.length === 0) {
      return null;
    }

    return toCategorySummariesFromSubtreeRows(rows, this.storageService);
  }

  async findAllByParentId(parentId?: string): Promise<CategorySummary[]> {
    const repository = this.entityManager.fork().getRepository(CategoryEntity);
    const categories = await repository.find(
      parentId ? { parent: parentId } : { parent: null },
      {
        populate: ['parent', 'attributes', 'attributes.options'],
        orderBy: { rank: 'asc' },
      },
    );

    return categories.map((category) => toCategorySummary(category, this.storageService));
  }

  async findById(id: string): Promise<CategorySummary | null> {
    const repository = this.entityManager.fork().getRepository(CategoryEntity);
    const category = await repository.findOne(
      { id },
      { populate: ['parent', 'attributes', 'attributes.options'] },
    );

    return category ? toCategorySummary(category, this.storageService) : null;
  }

  async searchSuggestions(
    name: string,
    limit: number,
  ): Promise<CategorySuggestion[]> {
    const repository = this.entityManager.fork().getRepository(CategoryEntity);
    const categories = await repository.findAll({
      populate: ['parent'],
      orderBy: [{ rank: 'asc' }, { name: 'asc' }],
    });
    const normalizedQuery = name.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const byId = new Map(categories.map((category) => [category.id, category]));
    const childrenByParentId = new Map<string, CategoryEntity[]>();

    for (const category of categories) {
      const parentId = category.parent?.id;
      if (!parentId) {
        continue;
      }

      const siblings = childrenByParentId.get(parentId) ?? [];
      siblings.push(category);
      childrenByParentId.set(parentId, siblings);
    }

    for (const siblings of childrenByParentId.values()) {
      siblings.sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));
    }

    const matches = categories
      .filter((category) => category.name.toLowerCase().includes(normalizedQuery))
      .slice(0, limit);
    const results: CategorySuggestion[] = [];
    const seenCategoryIds = new Set<string>();

    for (const match of matches) {
      if (results.length >= limit) {
        break;
      }

      const pathToMatch = buildPathToCategory(match, byId);
      const remaining = limit - results.length;
      const descendants = collectLeafSuggestions(
        match,
        pathToMatch,
        childrenByParentId,
        remaining,
      );

      if (descendants.length > 0) {
        for (const descendant of descendants) {
          if (seenCategoryIds.has(descendant.id)) {
            continue;
          }

          seenCategoryIds.add(descendant.id);
          results.push(descendant);

          if (results.length >= limit) {
            break;
          }
        }

        continue;
      }

      if (seenCategoryIds.has(match.id)) {
        continue;
      }

      seenCategoryIds.add(match.id);
      results.push({
        id: match.id,
        lastNameCategory: match.name,
        categoriesRelated: pathToMatch,
      });
    }

    return results;
  }
}

function buildPathToCategory(
  category: CategoryEntity,
  byId: Map<string, CategoryEntity>,
): string[] {
  const path: string[] = [];
  let currentCategory: CategoryEntity | undefined = category;

  while (currentCategory) {
    path.unshift(currentCategory.name);
    currentCategory = currentCategory.parent
      ? byId.get(currentCategory.parent.id)
      : undefined;
  }

  return path;
}

function collectLeafSuggestions(
  category: CategoryEntity,
  pathToCategory: string[],
  childrenByParentId: Map<string, CategoryEntity[]>,
  limit: number,
): CategorySuggestion[] {
  const directChildren = childrenByParentId.get(category.id) ?? [];

  if (directChildren.length === 0 || limit <= 0) {
    return [];
  }

  const results: CategorySuggestion[] = [];
  const queue = directChildren.map((child) => ({
    category: child,
    path: [...pathToCategory, child.name],
  }));

  while (queue.length > 0 && results.length < limit) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    const children = childrenByParentId.get(current.category.id) ?? [];

    if (children.length === 0) {
      results.push({
        id: current.category.id,
        lastNameCategory: current.category.name,
        categoriesRelated: current.path,
      });
      continue;
    }

    for (const child of children) {
      queue.push({
        category: child,
        path: [...current.path, child.name],
      });
    }
  }

  return results;
}

function toCategorySummariesFromSubtreeRows(
  rows: CategorySubtreeRow[],
  storageService: StorageService,
): CategorySummary[] {
  const categories = new Map<string, CategorySummary>();
  const attributesByCategoryId = new Map<string, Set<string>>();
  const optionsByAttributeId = new Map<string, Set<string>>();

  for (const row of rows) {
    let category = categories.get(row.category_id);

    if (!category) {
      category = {
        id: row.category_id,
        parentId: row.parent_id ?? undefined,
        name: row.category_name,
        rank: Number(row.category_rank),
        imageStorageKey: row.image_storage_key ?? undefined,
        featuredFacetKeys: toFeaturedFacetKeys(row.featured_facet_keys),
        imageUrl: row.image_storage_key
          ? storageService.getPublicUrl(row.image_storage_key)
          : undefined,
        attributes: [],
      };
      categories.set(row.category_id, category);
      attributesByCategoryId.set(row.category_id, new Set<string>());
    }

    if (!row.attribute_id || !row.attribute_key || !row.attribute_name) {
      continue;
    }

    const seenAttributeIds = attributesByCategoryId.get(row.category_id);
    let attribute = category.attributes.find((item) => item.id === row.attribute_id);

    if (!attribute && !seenAttributeIds?.has(row.attribute_id)) {
      attribute = {
        id: row.attribute_id,
        key: row.attribute_key,
        name: row.attribute_name,
        inputType: row.attribute_input_type ?? 'select',
        isRequired: row.attribute_is_required ?? false,
        rank: Number(row.attribute_rank ?? 1),
        options: [],
      };
      category.attributes.push(attribute);
      seenAttributeIds?.add(row.attribute_id);
      optionsByAttributeId.set(row.attribute_id, new Set<string>());
    }

    if (!attribute || !row.option_id || !row.option_value) {
      continue;
    }

    const seenOptionIds = optionsByAttributeId.get(row.attribute_id);

    if (seenOptionIds?.has(row.option_id)) {
      continue;
    }

    attribute.options.push({
      id: row.option_id,
      value: row.option_value,
      rank: Number(row.option_rank ?? 1),
    });
    seenOptionIds?.add(row.option_id);
  }

  return Array.from(categories.values()).map((category) => ({
    ...category,
    attributes: category.attributes
      .sort((left, right) => left.rank - right.rank)
      .map((attribute) => ({
        ...attribute,
        options: attribute.options.sort((left, right) => left.rank - right.rank),
      })),
  }));
}

function toFeaturedFacetKeys(value: CategorySubtreeRow['featured_facet_keys']): string[] | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : undefined;
  }
  catch {
    return undefined;
  }
}
