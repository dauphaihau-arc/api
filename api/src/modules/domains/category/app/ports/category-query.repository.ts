import type {
  CategorySuggestion,
  CategorySummary
} from '../category.types';

export abstract class CategoryQueryRepository {
  abstract findAllByParentId(parentId?: string): Promise<CategorySummary[]>;
  abstract findById(id: string): Promise<CategorySummary | null>;
  abstract searchSuggestions(
    name: string,
    limit: number
  ): Promise<CategorySuggestion[]>;
}
