import type {
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput,
} from '../category.types';

export abstract class CategoryCommandRepository {
  abstract create(input: CreateCategoryInput): Promise<CategorySummary>;

  abstract createAttribute(
    input: CreateCategoryAttributeInput
  ): Promise<CategorySummary | null>;
}
