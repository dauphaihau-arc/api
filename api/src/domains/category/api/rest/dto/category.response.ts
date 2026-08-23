export type CategoryAttributeOptionResponse = {
  id: string;
  value: string;
  rank: number;
};

export type CategoryAttributeResponse = {
  id: string;
  key: string;
  name: string;
  input_type: string;
  is_required: boolean;
  rank: number;
  options: CategoryAttributeOptionResponse[];
};

export type CategoryResponse = {
  id: string;
  parent_id?: string;
  name: string;
  rank: number;
  image_url?: string;
  featured_facet_keys?: string[];
  attributes: CategoryAttributeResponse[];
};

export type CategorySuggestionResponse = {
  id: string;
  last_name_category: string;
  categories_related: string[];
};
