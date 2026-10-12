export interface CategorySummary {
  /** Internal database identity (UUID). Never exposed at the API boundary. */
  id: string;
  /** Public identity (positive decimal string). The externally visible category id. */
  publicId: string;
  /** Current persisted slug, used to build canonical category URLs. */
  slug: string;
  /** Internal database identity of the parent (UUID). */
  parentId?: string;
  /** Public identity of the parent, when present. */
  parentPublicId?: string;
  name: string;
  rank: number;
  imageStorageKey?: string;
  imageUrl?: string;
  featuredFacetKeys?: string[];
  attributes: CategoryAttributeSummary[];
}

/**
 * Identity, current slug, and display name of a category in a resolved
 * ancestry. All identities are public (positive decimal strings).
 */
export interface CategoryAncestor {
  /** Public identity (positive decimal string). */
  id: string;
  /** Current slug of the category. */
  slug: string;
  name: string;
}

export interface CategoryResolution {
  category: CategoryAncestor & { featuredFacetKeys?: string[] };
  /** Ordered root-to-current ancestry; includes the resolved category last. */
  ancestry: CategoryAncestor[];
}

export interface CategoryAttributeSummary {
  id: string;
  key: string;
  name: string;
  inputType: string;
  isRequired: boolean;
  rank: number;
  options: CategoryAttributeOptionSummary[];
}

export interface CategoryAttributeOptionSummary {
  id: string;
  value: string;
  rank: number;
}

export interface CategorySuggestion {
  id: string;
  lastNameCategory: string;
  categoriesRelated: string[];
}

export interface CreateCategoryInput {
  parentId?: string;
  name: string;
  rank: number;
  imageStorageKey?: string;
  featuredFacetKeys?: string[];
}

export interface CreateCategoryAttributeInput {
  categoryId: string;
  key?: string;
  name: string;
  inputType?: string;
  isRequired?: boolean;
  rank?: number;
  options: Array<{
    value: string;
    rank: number;
  }>;
}
