import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { toSlug } from '~/shared/utils/slug';
import { CategoryCommandRepository } from '../app/ports/category-command.repository';
import { normalizeCategorySlug } from './category-slug';
import type {
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput,
} from '../app/category.types';
import { CategoryAttributeOptionEntity } from './persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from './persistence/entities/category-attribute.entity';
import { CategoryEntity } from './persistence/entities/category.entity';
import { toCategorySummary } from './category-summary.projector';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';

@Injectable()
export class MikroOrmCategoryCommandRepository implements CategoryCommandRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async create(input: CreateCategoryInput): Promise<CategorySummary> {
    const entityManager = this.entityManager.fork();
    const allocated = await entityManager.getConnection().execute<Array<{ public_id: string }>>(
      'select nextval(\'category_public_id_seq\')::text as public_id',
    );
    const [identity] = allocated;
    const repository = entityManager.getRepository(CategoryEntity);

    const category = repository.create({
      publicId: identity.public_id,
      parent: input.parentId
        ? entityManager.getReference(CategoryEntity, input.parentId)
        : undefined,
      name: input.name,
      slug: normalizeCategorySlug(input.name),
      rank: input.rank,
      imageStorageKey: input.imageStorageKey,
      featuredFacetKeys: input.featuredFacetKeys,
    });

    await entityManager.persistAndFlush(category);
    await entityManager.populate(category, ['parent', 'attributes', 'attributes.options']);

    return toCategorySummary(category, this.storageService);
  }

  async createAttribute(
    input: CreateCategoryAttributeInput,
  ): Promise<CategorySummary | null> {
    const entityManager = this.entityManager.fork();
    const categoryRepository = entityManager.getRepository(CategoryEntity);
    const category = await categoryRepository.findOne(
      { id: input.categoryId },
      { populate: ['parent', 'attributes', 'attributes.options'] },
    );

    if (!category) {
      return null;
    }

    const attribute = entityManager.create(CategoryAttributeEntity, {
      category,
      key: input.key?.trim() || toSlug(input.name).replaceAll('-', '_'),
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

    return toCategorySummary(category, this.storageService);
  }
}
