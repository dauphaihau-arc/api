export interface CategorySummary {
  id: string;
  parentId?: string;
  name: string;
  rank: number;
  imageStorageKey?: string;
  imageUrl?: string;
  featuredFacetKeys?: string[];
  attributes: CategoryAttributeSummary[];
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
