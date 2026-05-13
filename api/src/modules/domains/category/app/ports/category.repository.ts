import type {
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput
} from '../category.types';

export abstract class CategoryRepository {
  abstract create(input: CreateCategoryInput): Promise<CategorySummary>;
  abstract createAttribute(
    input: CreateCategoryAttributeInput
  ): Promise<CategorySummary | null>;
  abstract findAllByParentId(parentId?: string): Promise<CategorySummary[]>;
  abstract findById(id: string): Promise<CategorySummary | null>;
}
