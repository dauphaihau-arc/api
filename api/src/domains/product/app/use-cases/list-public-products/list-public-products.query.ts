import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import {
  expandShoeSizeOptionKeys,
  expandShoeSizeOptionValues,
} from '../../shoe-size-groups';
import type { ListPublicProductsInput } from '../../product.types';

export interface ListPublicProductsQuery {
  page: number;
  limit: number;
  categoryId?: string;
  search?: string;
  title?: string;
  isDigital?: boolean;
  whoMade?: ListPublicProductsInput['whoMade'];
  minPrice?: number;
  maxPrice?: number;
  attributeFilters?: Array<{
    attribute_id?: string;
    selected_option_ids?: string[];
    selected_option_keys?: string[];
    attribute_name: string;
    selected_option_values: string[];
  }>;
  order?: ListPublicProductsInput['order'];
}

export function toListPublicProductsInput(
  query: ListPublicProductsQuery,
  categoryIds: string[] | undefined,
): ListPublicProductsInput {
  return {
    page: query.page,
    limit: query.limit,
    categoryIds,
    search: query.search?.trim() || undefined,
    title: query.title?.trim() || undefined,
    isDigital: query.isDigital,
    whoMade: query.whoMade,
    minPriceMinor: query.minPrice,
    maxPriceMinor: query.maxPrice,
    attributeFilters: normalizeAttributeFilters(query.attributeFilters),
    order: query.order,
  };
}

export async function resolveQueryCategoryIds(
  categoryRepository: CategoryRepository,
  categoryId?: string,
): Promise<string[] | undefined> {
  return categoryId
    ? resolveCategorySubtreeIds(categoryRepository, categoryId)
    : undefined;
}

function normalizeAttributeFilters(
  filters?: ListPublicProductsQuery['attributeFilters'],
): ListPublicProductsInput['attributeFilters'] {
  if (!Array.isArray(filters)) {
    return undefined;
  }

  return filters
    ?.flatMap((filter) => {
      const attributeNameSource = 'attribute_name' in filter
        ? filter.attribute_name
        : (filter as {
          attributeName?: string;
        }).attributeName;
      const attributeIdSource = 'attribute_id' in filter
        ? filter.attribute_id
        : (filter as {
          attributeId?: string;
        }).attributeId;
      const selectedOptionValuesSource = 'selected_option_values' in filter
        ? filter.selected_option_values
        : (filter as {
          selectedOptionValues?: string[];
        }).selectedOptionValues;
      const selectedOptionIdsSource = 'selected_option_ids' in filter
        ? filter.selected_option_ids
        : (filter as {
          selectedOptionIds?: string[];
        }).selectedOptionIds;
      const selectedOptionKeysSource = 'selected_option_keys' in filter
        ? filter.selected_option_keys
        : (filter as {
          selectedOptionKeys?: string[];
        }).selectedOptionKeys;
      const attributeId = typeof attributeIdSource === 'string'
        ? attributeIdSource.trim()
        : '';
      const attributeName = typeof attributeNameSource === 'string'
        ? attributeNameSource.trim()
        : '';
      const selectedOptionIds = Array.isArray(selectedOptionIdsSource)
        ? selectedOptionIdsSource
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
        : [];
      const selectedOptionValues = Array.isArray(selectedOptionValuesSource)
        ? selectedOptionValuesSource
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
        : [];
      const selectedOptionKeys = Array.isArray(selectedOptionKeysSource)
        ? selectedOptionKeysSource
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
        : [];
      const normalizedSelectedOptionKeys = attributeId === 'shoe_size'
        ? expandShoeSizeOptionKeys(selectedOptionKeys)
        : selectedOptionKeys;
      const normalizedSelectedOptionValues = attributeId === 'shoe_size'
        ? expandShoeSizeOptionValues(selectedOptionValues)
        : selectedOptionValues;

      if (!attributeId && !attributeName) {
        return [];
      }

      if (
        selectedOptionIds.length === 0
        && normalizedSelectedOptionKeys.length === 0
        && normalizedSelectedOptionValues.length === 0
      ) {
        return [];
      }

      return [{
        ...(attributeId ? { attributeId } : {}),
        ...(selectedOptionIds.length > 0 ? { selectedOptionIds } : {}),
        ...(normalizedSelectedOptionKeys.length > 0 ? { selectedOptionKeys: normalizedSelectedOptionKeys } : {}),
        attributeName,
        selectedOptionValues: normalizedSelectedOptionValues,
      }];
    })
    .filter((filter) =>
      (filter.attributeId?.length ?? 0) > 0
      || filter.attributeName.length > 0,
    );
}

async function resolveCategorySubtreeIds(
  categoryRepository: CategoryRepository,
  categoryId: string,
): Promise<string[]> {
  const category = await categoryRepository.findById(categoryId);

  if (!category) {
    return [];
  }

  const resolvedIds = new Set<string>([categoryId]);
  const pendingParentIds = [categoryId];

  while (pendingParentIds.length > 0) {
    const parentId = pendingParentIds.shift();

    if (!parentId) {
      continue;
    }

    const children = await categoryRepository.findAllByParentId(parentId);

    for (const child of children) {
      if (resolvedIds.has(child.id)) {
        continue;
      }

      resolvedIds.add(child.id);
      pendingParentIds.push(child.id);
    }
  }

  return Array.from(resolvedIds);
}
