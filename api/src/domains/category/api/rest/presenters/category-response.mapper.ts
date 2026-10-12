import type {
  CategoryAncestor,
  CategoryAttributeSummary,
  CategoryResolution,
  CategorySuggestion,
  CategorySummary,
} from '../../../app/category.types';
import { buildCategoryCanonicalPath } from '../../../app/category-canonical-path';
import type {
  CategoryAncestorResponse,
  CategoryAttributeOptionResponse,
  CategoryAttributeResponse,
  CategoryResolutionResponse,
  CategoryResponse,
  CategorySuggestionResponse,
} from '../responses/category.response';

const toCategoryAttributeOptionResponse = (
  option: CategoryAttributeSummary['options'][number],
): CategoryAttributeOptionResponse => ({
  id: option.id,
  value: option.value,
  rank: option.rank,
});

export const toCategoryAttributeResponse = (
  attribute: CategoryAttributeSummary,
): CategoryAttributeResponse => ({
  id: attribute.id,
  key: attribute.key,
  name: attribute.name,
  input_type: attribute.inputType,
  is_required: attribute.isRequired,
  rank: attribute.rank,
  options: attribute.options.map(toCategoryAttributeOptionResponse),
});

export const toCategoryResponse = (
  category: CategorySummary,
): CategoryResponse => ({
  id: category.publicId,
  parent_id: category.parentPublicId,
  slug: category.slug,
  name: category.name,
  rank: category.rank,
  image_url: category.imageUrl,
  featured_facet_keys: category.featuredFacetKeys,
  attributes: category.attributes.map(toCategoryAttributeResponse),
});

const toCategoryAncestorResponse = (
  ancestor: CategoryAncestor,
): CategoryAncestorResponse => ({
  id: ancestor.id,
  slug: ancestor.slug,
  name: ancestor.name,
});

export const toCategoryResolutionResponse = (
  resolution: CategoryResolution,
): CategoryResolutionResponse => ({
  category: {
    ...toCategoryAncestorResponse(resolution.category),
    featured_facet_keys: resolution.category.featuredFacetKeys,
  },
  ancestry: resolution.ancestry.map(toCategoryAncestorResponse),
  canonical_path: buildCategoryCanonicalPath(resolution.category),
});

export const toCategorySuggestionResponse = (
  category: CategorySuggestion,
): CategorySuggestionResponse => ({
  id: category.id,
  last_name_category: category.lastNameCategory,
  categories_related: category.categoriesRelated,
});
