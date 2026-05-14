export interface CategorySummary {
  id: string;
  parentId?: string;
  name: string;
  rank: number;
  imageStorageKey?: string;
  attributes: CategoryAttributeSummary[];
}

export interface CategoryAttributeSummary {
  id: string;
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

export interface CategorySearchSuggestion {
  id: string;
  lastNameCategory: string;
  categoriesRelated: string[];
}

export interface CreateCategoryInput {
  parentId?: string;
  name: string;
  rank: number;
  imageStorageKey?: string;
}

export interface CreateCategoryAttributeInput {
  categoryId: string;
  name: string;
  inputType?: string;
  isRequired?: boolean;
  rank?: number;
  options: Array<{
    value: string;
    rank: number;
  }>;
}
