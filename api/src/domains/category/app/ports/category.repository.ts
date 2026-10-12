import type {
  CategoryResolution,
  CategorySuggestion,
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput,
} from '../category.types';

export abstract class CategoryRepository {
  findSelfAndDescendantIds?(id: string): Promise<string[] | null>;
  findSelfAndDescendants?(id: string): Promise<CategorySummary[] | null>;
  abstract create(input: CreateCategoryInput): Promise<CategorySummary>;
  abstract createAttribute(
    input: CreateCategoryAttributeInput
  ): Promise<CategorySummary | null>;
  abstract findAllByParentId(parentId?: string): Promise<CategorySummary[]>;
  abstract findById(id: string): Promise<CategorySummary | null>;
  /**
   * Resolve a public category identity to its summary. Returns null for
   * unknown or non-public-identity input; it MUST NOT fall back to internal id
   * lookup, so numeric collisions cannot resolve to the wrong category.
   */
  abstract findByPublicId(publicId: string): Promise<CategorySummary | null>;
  /**
   * Authoritative resolution of a public identity to its current category and
   * ordered root-to-current ancestry. Returns null for unknown, malformed, or
   * out-of-range identities.
   */
  abstract resolveByPublicId(
    publicId: string,
  ): Promise<CategoryResolution | null>;
  abstract searchSuggestions(
    name: string,
    limit: number
  ): Promise<CategorySuggestion[]>;
}
