import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { CategoryRepository } from '../app/ports/category.repository';
import type {
  CategorySearchSuggestion,
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput
} from '../app/category.types';
import { CategoryAttributeOptionEntity } from './persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from './persistence/entities/category-attribute.entity';
import { CategoryEntity } from './persistence/entities/category.entity';

@Injectable()
export class MikroOrmCategoryRepository implements CategoryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService
  ) {}

  async create(input: CreateCategoryInput): Promise<CategorySummary> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(CategoryEntity);
    const category = repository.create({
      parent: input.parentId
        ? entityManager.getReference(CategoryEntity, input.parentId)
        : undefined,
      name: input.name,
      rank: input.rank,
      imageStorageKey: input.imageStorageKey,
    });

    await entityManager.persistAndFlush(category);
    await entityManager.populate(category, ['parent', 'attributes', 'attributes.options']);

    return this.toSummary(category);
  }

  async createAttribute(
    input: CreateCategoryAttributeInput
  ): Promise<CategorySummary | null> {
    const entityManager = this.entityManager.fork();
    const categoryRepository = entityManager.getRepository(CategoryEntity);
    const category = await categoryRepository.findOne(
      { id: input.categoryId },
      { populate: ['parent', 'attributes', 'attributes.options'] }
    );

    if (!category) {
      return null;
    }

    const attribute = entityManager.create(CategoryAttributeEntity, {
      category,
      name: input.name,
      inputType: input.inputType ?? 'select',
      isRequired: input.isRequired ?? false,
      rank: input.rank ?? 1,
    });

    for (const option of input.options) {
      const optionEntity = entityManager.create(CategoryAttributeOptionEntity, {
        categoryAttribute: attribute,
        value: option.value,
        rank: option.rank,
      });
      attribute.options.add(optionEntity);
      entityManager.persist(optionEntity);
    }

    category.attributes.add(attribute);
    entityManager.persist(attribute);

    await entityManager.persistAndFlush(category);
    await entityManager.populate(category, ['parent', 'attributes', 'attributes.options']);

    return this.toSummary(category);
  }

  async findAllByParentId(parentId?: string): Promise<CategorySummary[]> {
    const repository = this.entityManager.fork().getRepository(CategoryEntity);
    const categories = await repository.find(
      parentId ? { parent: parentId } : { parent: null },
      {
        populate: ['parent', 'attributes', 'attributes.options'],
        orderBy: { rank: 'asc' },
      }
    );

    return categories.map((category) => this.toSummary(category));
  }

  async findById(id: string): Promise<CategorySummary | null> {
    const repository = this.entityManager.fork().getRepository(CategoryEntity);
    const category = await repository.findOne(
      { id },
      { populate: ['parent', 'attributes', 'attributes.options'] }
    );

    if (!category) {
      return null;
    }

    return this.toSummary(category);
  }

  async searchSuggestions(
    name: string,
    limit: number
  ): Promise<CategorySearchSuggestion[]> {
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
    const results: CategorySearchSuggestion[] = [];
    const seenCategoryIds = new Set<string>();

    for (const match of matches) {
      if (results.length >= limit) {
        break;
      }

      const pathToMatch = this.buildPathToCategory(match, byId);
      const remaining = limit - results.length;
      const descendants = this.collectLeafSuggestions(
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

  private toSummary(category: CategoryEntity): CategorySummary {
    return {
      id: category.id,
      parentId: category.parent?.id,
      name: category.name,
      rank: category.rank,
      imageStorageKey: category.imageStorageKey,
      imageUrl: category.imageStorageKey
        ? this.storageService.getPublicUrl(category.imageStorageKey)
        : undefined,
      attributes: category.attributes
        .getItems()
        .sort((left, right) => left.rank - right.rank)
        .map((attribute) => ({
          id: attribute.id,
          name: attribute.name,
          inputType: attribute.inputType,
          isRequired: attribute.isRequired,
          rank: attribute.rank,
          options: attribute.options
            .getItems()
            .sort((left, right) => left.rank - right.rank)
            .map((option) => ({
              id: option.id,
              value: option.value,
              rank: option.rank,
            })),
        })),
    };
  }

  private buildPathToCategory(
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

  private collectLeafSuggestions(
    category: CategoryEntity,
    pathToCategory: string[],
    childrenByParentId: Map<string, CategoryEntity[]>,
    limit: number
  ): CategorySearchSuggestion[] {
    const directChildren = childrenByParentId.get(category.id) ?? [];

    if (directChildren.length === 0 || limit <= 0) {
      return [];
    }

    const results: CategorySearchSuggestion[] = [];
    const queue = directChildren.map((child) => ({
      category: child,
      path: [...pathToCategory, child.name],
    }));

    while (queue.length > 0 && results.length < limit) {
      const current = queue.shift();

      if (!current) {
        continue;
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
}
