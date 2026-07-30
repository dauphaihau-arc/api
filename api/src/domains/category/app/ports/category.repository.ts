import type {
  CategorySuggestion,
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput,
} from '../category.types';

export abstract class CategoryRepository {
  abstract create(input: CreateCategoryInput): Promise<CategorySummary>;
  abstract createAttribute(
    input: CreateCategoryAttributeInput
  ): Promise<CategorySummary | null>;
  abstract findAllByParentId(parentId?: string): Promise<CategorySummary[]>;
  abstract findById(id: string): Promise<CategorySummary | null>;
  abstract searchSuggestions(
    name: string,
    limit: number
  ): Promise<CategorySuggestion[]>;
}
