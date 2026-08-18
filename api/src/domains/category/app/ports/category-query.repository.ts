import type {
  CategorySuggestion,
  CategorySummary,
} from '../category.types';

export abstract class CategoryQueryRepository {
  findSelfAndDescendantIds?(id: string): Promise<string[] | null>;
  findSelfAndDescendants?(id: string): Promise<CategorySummary[] | null>;
  abstract findAllByParentId(parentId?: string): Promise<CategorySummary[]>;
  abstract findById(id: string): Promise<CategorySummary | null>;
  abstract searchSuggestions(
    name: string,
    limit: number
  ): Promise<CategorySuggestion[]>;
}
