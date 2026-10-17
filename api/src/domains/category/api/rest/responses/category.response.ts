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
  slug: string;
  name: string;
  rank: number;
  /**
   * Primary image URL. Points at the `root_2x3` variant (420x630) when it has
   * been generated, otherwise at the untouched original.
   */
  image_url?: string;
  /** Square (1:1, 200x200) variant for compact and round category tiles. */
  image_url_1x1?: string;
  featured_facet_keys?: string[];
  attributes: CategoryAttributeResponse[];
};

export type CategoryAncestorResponse = {
  id: string;
  slug: string;
  name: string;
};

export type CategoryResolutionResponse = {
  category: {
    id: string;
    slug: string;
    name: string;
    featured_facet_keys?: string[];
  };
  ancestry: CategoryAncestorResponse[];
  canonical_path: string;
};

export type CategorySuggestionResponse = {
  id: string;
  last_name_category: string;
  categories_related: string[];
};
