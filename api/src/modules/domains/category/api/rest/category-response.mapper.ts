import type {
  CategoryAttributeSummary,
  CategorySuggestion,
  CategorySummary
} from '../../app/category.types';
import type {
  CategoryAttributeOptionResponse,
  CategoryAttributeResponse,
  CategoryResponse,
  CategorySuggestionResponse
} from './dto/category.response';

const toCategoryAttributeOptionResponse = (
  option: CategoryAttributeSummary['options'][number]
): CategoryAttributeOptionResponse => ({
  id: option.id,
  value: option.value,
  rank: option.rank,
});

export const toCategoryAttributeResponse = (
  attribute: CategoryAttributeSummary
): CategoryAttributeResponse => ({
  id: attribute.id,
  name: attribute.name,
  input_type: attribute.inputType,
  is_required: attribute.isRequired,
  rank: attribute.rank,
  options: attribute.options.map(toCategoryAttributeOptionResponse),
});

export const toCategoryResponse = (
  category: CategorySummary
): CategoryResponse => ({
  id: category.id,
  parent_id: category.parentId,
  name: category.name,
  rank: category.rank,
  image_storage_key: category.imageStorageKey,
  image_url: category.imageUrl,
  attributes: category.attributes.map(toCategoryAttributeResponse),
});

export const toCategorySuggestionResponse = (
  category: CategorySuggestion
): CategorySuggestionResponse => ({
  id: category.id,
  last_name_category: category.lastNameCategory,
  categories_related: category.categoriesRelated,
});
