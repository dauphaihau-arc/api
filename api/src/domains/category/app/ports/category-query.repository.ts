import type {
  CategoryResolution,
  CategorySuggestion,
  CategorySummary,
} from '../category.types';

export abstract class CategoryQueryRepository {
  findSelfAndDescendantIds?(id: string): Promise<string[] | null>;
  findSelfAndDescendants?(id: string): Promise<CategorySummary[] | null>;
  abstract findAllByParentId(parentId?: string): Promise<CategorySummary[]>;
  abstract findById(id: string): Promise<CategorySummary | null>;
  abstract findByPublicId(publicId: string): Promise<CategorySummary | null>;
  /**
   * Authoritative resolution of a public identity to its current category and
   * ordered root-to-current ancestry. Returns null for unknown, malformed, or
   * out-of-range identities; it never falls back to internal-id lookup.
   */
  abstract resolveByPublicId(
    publicId: string,
  ): Promise<CategoryResolution | null>;
  /**
   * Resolve a permanently owned legacy hierarchical path to the current
   * category and ancestry. Ownership is bound to category identity, so the
   * result always reflects the latest slug. Returns null for malformed or
   * unowned paths; it never falls back to a parent path or a first match.
   */
  abstract resolveLegacyPath(
    legacyPath: string,
  ): Promise<CategoryResolution | null>;
  abstract searchSuggestions(
    name: string,
    limit: number
  ): Promise<CategorySuggestion[]>;
}
