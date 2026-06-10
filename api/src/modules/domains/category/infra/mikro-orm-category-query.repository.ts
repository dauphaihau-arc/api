import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { CategoryQueryRepository } from '../app/ports/category-query.repository';
import type {
  CategorySuggestion,
  CategorySummary
} from '../app/category.types';
import { CategoryEntity } from './persistence/entities/category.entity';
import { toCategorySummary } from './category-summary.projector';

@Injectable()
export class MikroOrmCategoryQueryRepository implements CategoryQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService
  ) {}

  async findAllByParentId(parentId?: string): Promise<CategorySummary[]> {
    const repository = this.entityManager.fork().getRepository(CategoryEntity);
    const categories = await repository.find(
      parentId ? { parent: parentId } : { parent: null },
      {
        populate: ['parent', 'attributes', 'attributes.options'],
        orderBy: { rank: 'asc' },
      }
    );

    return categories.map((category) => toCategorySummary(category, this.storageService));
  }

  async findById(id: string): Promise<CategorySummary | null> {
    const repository = this.entityManager.fork().getRepository(CategoryEntity);
    const category = await repository.findOne(
      { id },
      { populate: ['parent', 'attributes', 'attributes.options'] }
    );

    return category ? toCategorySummary(category, this.storageService) : null;
  }

  async searchSuggestions(
    name: string,
    limit: number
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
        remaining
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
  byId: Map<string, CategoryEntity>
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
  limit: number
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
