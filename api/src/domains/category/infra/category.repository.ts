import { Injectable } from '@nestjs/common';
import { OptionalCacheService } from '~/integrations/cache/optional-cache.service';
import { CategoryRepository } from '../app/ports/category.repository';
import { CategoryCommandRepository } from '../app/ports/category-command.repository';
import { CategoryQueryRepository } from '../app/ports/category-query.repository';
import type {
  CategorySuggestion,
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput,
} from '../app/category.types';

const CATEGORY_TAXONOMY_SUBTREE_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class DelegatingCategoryRepository implements CategoryRepository {
  constructor(
    private readonly commandRepository: CategoryCommandRepository,
    private readonly queryRepository: CategoryQueryRepository,
    private readonly optionalCacheService: OptionalCacheService,
  ) {}

  create(input: CreateCategoryInput): Promise<CategorySummary> {
    return this.commandRepository.create(input);
  }

  createAttribute(
    input: CreateCategoryAttributeInput,
  ): Promise<CategorySummary | null> {
    return this.commandRepository.createAttribute(input);
  }

  findSelfAndDescendantIds(id: string): Promise<string[] | null> {
    return this.queryRepository.findSelfAndDescendantIds
      ? this.queryRepository.findSelfAndDescendantIds(id)
      : this.findSelfAndDescendantIdsByWalkingTree(id);
  }

  async findSelfAndDescendants(id: string): Promise<CategorySummary[] | null> {
    const cacheKey = buildCategoryTaxonomySubtreeCacheKey(id);

    const cachedCategories = await this.optionalCacheService.get<CategorySummary[] | null>(
      'category.taxonomy-subtree',
      cacheKey,
    );

    if (cachedCategories !== undefined) {
      return cachedCategories;
    }

    const categories = await (this.queryRepository.findSelfAndDescendants
      ? this.queryRepository.findSelfAndDescendants(id)
      : this.findSelfAndDescendantsByWalkingTree(id));

    await this.optionalCacheService.set(
      'category.taxonomy-subtree',
      cacheKey,
      categories,
      CATEGORY_TAXONOMY_SUBTREE_CACHE_TTL_MS,
    );

    return categories;
  }

  findAllByParentId(parentId?: string): Promise<CategorySummary[]> {
    return this.queryRepository.findAllByParentId(parentId);
  }

  findById(id: string): Promise<CategorySummary | null> {
    return this.queryRepository.findById(id);
  }

  searchSuggestions(name: string, limit: number): Promise<CategorySuggestion[]> {
    return this.queryRepository.searchSuggestions(name, limit);
  }

  private async findSelfAndDescendantIdsByWalkingTree(id: string): Promise<string[] | null> {
    const category = await this.findById(id);

    if (!category) {
      return null;
    }

    const resolvedIds = new Set<string>([id]);
    const pendingParentIds = [id];

    while (pendingParentIds.length > 0) {
      const parentId = pendingParentIds.shift();

      if (!parentId) {
        continue;
      }

      const children = await this.findAllByParentId(parentId);

      for (const child of children) {
        if (resolvedIds.has(child.id)) {
          continue;
        }

        resolvedIds.add(child.id);
        pendingParentIds.push(child.id);
      }
    }

    return Array.from(resolvedIds);
  }

  private async findSelfAndDescendantsByWalkingTree(id: string): Promise<CategorySummary[] | null> {
    const category = await this.findById(id);

    if (!category) {
      return null;
    }

    const resolvedCategories = new Map<string, CategorySummary>([[category.id, category]]);
    const pendingParentIds = [id];

    while (pendingParentIds.length > 0) {
      const parentId = pendingParentIds.shift();

      if (!parentId) {
        continue;
      }

      const children = await this.findAllByParentId(parentId);

      for (const child of children) {
        if (resolvedCategories.has(child.id)) {
          continue;
        }

        resolvedCategories.set(child.id, child);
        pendingParentIds.push(child.id);
      }
    }

    return Array.from(resolvedCategories.values());
  }
}

function buildCategoryTaxonomySubtreeCacheKey(id: string): string {
  return `category:taxonomy-subtree:v1:${id}`;
}
