import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../app/ports/category.repository';
import type {
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput
} from '../app/category.types';
import { CategoryAttributeOptionEntity } from './persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from './persistence/entities/category-attribute.entity';
import { CategoryEntity } from './persistence/entities/category.entity';

@Injectable()
export class MikroOrmCategoryRepository implements CategoryRepository {
  constructor(private readonly entityManager: EntityManager) {}

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

  private toSummary(category: CategoryEntity): CategorySummary {
    return {
      id: category.id,
      parentId: category.parent?.id,
      name: category.name,
      rank: category.rank,
      imageStorageKey: category.imageStorageKey,
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
}
