import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import type { CategorySummary } from '~/modules/domains/category/app/category.types';
import { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import {
  expandShoeSizeOptionKeys,
  expandShoeSizeOptionValues,
  toCanonicalFacetOption
} from '../../shoe-size-groups';
import { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type {
  ListPublicProductsInput,
  PublicProductFacet,
  PublicProductFacetOption,
  PublicProductListResult
} from '../../product.types';

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

@Injectable()
export class ListPublicProductsUseCase {
  constructor(
    private readonly productRepository: StorefrontProductQueryRepository,
    private readonly categoryRepository: CategoryRepository
  ) {}

  async execute(query: ListPublicProductsQuery): Promise<PublicProductListResult> {
    const categoryIds = await this.resolveQueryCategoryIds(query.categoryId);

    if (query.categoryId && categoryIds?.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(query.page, query.limit, 0),
      };
    }

    const result = await this.productRepository.listPublic({
      page: query.page,
      limit: query.limit,
      categoryIds,
      search: query.search?.trim() || undefined,
      title: query.title?.trim() || undefined,
      isDigital: query.isDigital,
      whoMade: query.whoMade,
      minPriceMinor: query.minPrice,
      maxPriceMinor: query.maxPrice,
      attributeFilters: this.normalizeAttributeFilters(query.attributeFilters),
      order: query.order,
    });

    return {
      items: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.meta.total),
    };
  }

  async executeFacets(query: ListPublicProductsQuery): Promise<PublicProductFacet[]> {
    const category = query.categoryId
      ? await this.categoryRepository.findById(query.categoryId)
      : null;
    const featuredFacetCategory = category
      ? await this.resolveFeaturedFacetCategory(category)
      : null;
    const categoryIds = await this.resolveQueryCategoryIds(query.categoryId);

    if (query.categoryId && categoryIds?.length === 0) {
      return [];
    }

    const facets = await this.productRepository.listPublicFacets({
      page: query.page,
      limit: query.limit,
      categoryIds,
      search: query.search?.trim() || undefined,
      title: query.title?.trim() || undefined,
      isDigital: query.isDigital,
      whoMade: query.whoMade,
      minPriceMinor: query.minPrice,
      maxPriceMinor: query.maxPrice,
      attributeFilters: this.normalizeAttributeFilters(query.attributeFilters),
      order: query.order,
    });

    return this.mergeFeaturedFacets({
      category,
      featuredFacetCategory,
      facets,
    });
  }

  private normalizeAttributeFilters(
    filters?: ListPublicProductsQuery['attributeFilters']
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
        || filter.attributeName.length > 0
      );
  }

  private async mergeFeaturedFacets({
    category,
    featuredFacetCategory,
    facets,
  }: {
    category: CategorySummary | null;
    featuredFacetCategory: CategorySummary | null;
    facets: PublicProductFacet[];
  }): Promise<PublicProductFacet[]> {
    const featuredFacetKeys = featuredFacetCategory?.featuredFacetKeys ?? [];
    const subtreeFacetKeys = category
      ? await this.resolveCommonLeafFacetKeys(category)
      : [];
    const taxonomyFacetKeys = Array.from(new Set([
      ...featuredFacetKeys,
      ...subtreeFacetKeys,
    ]));
    const taxonomyFacetKeySet = new Set(taxonomyFacetKeys);

    if (taxonomyFacetKeys.length === 0) {
      return facets.filter((facet) => facet.options.length > 0);
    }

    const mergedFacets = facets
      .filter((facet) => taxonomyFacetKeySet.has(facet.facetKey) || facet.options.length > 0)
      .map((facet) => ({
        ...facet,
        options: [...facet.options],
      }));
    const facetsByKey = new Map(mergedFacets.map((facet) => [facet.facetKey, facet]));

    for (const facetKey of taxonomyFacetKeys) {
      const attribute = await this.resolveFacetAttributeForDisplay({
        category,
        featuredFacetCategory,
        facetKey,
      });
      const taxonomyOptions = await this.resolveFacetTaxonomyOptions({
        category,
        featuredFacetCategory,
        facetKey,
      });
      const existingFacet = facetsByKey.get(facetKey);

      if (!existingFacet) {
        if (!attribute) {
          continue;
        }

        const facet: PublicProductFacet = {
          facetKey,
          attributeName: attribute.name,
          options: taxonomyOptions,
        };
        mergedFacets.push(facet);
        facetsByKey.set(facetKey, facet);
        continue;
      }

      existingFacet.attributeName = attribute?.name ?? existingFacet.attributeName;
      existingFacet.options = mergeFacetOptions(existingFacet.options, taxonomyOptions);
    }

    return mergedFacets.sort(compareFacetNames);
  }

  private async resolveCommonLeafFacetKeys(category: CategorySummary): Promise<string[]> {
    const leafCategories = await this.resolveLeafCategories(category);

    if (leafCategories.length === 0) {
      return [];
    }

    const facetKeyCounts = new Map<string, number>();

    leafCategories.forEach((leafCategory) => {
      const uniqueFacetKeys = new Set(leafCategory.attributes.map((attribute) => attribute.key));

      uniqueFacetKeys.forEach((facetKey) => {
        facetKeyCounts.set(facetKey, (facetKeyCounts.get(facetKey) ?? 0) + 1);
      });
    });

    return Array.from(facetKeyCounts.entries())
      .filter(([, count]) => count === leafCategories.length)
      .map(([facetKey]) => facetKey);
  }

  private async resolveFeaturedFacetCategory(
    category: CategorySummary
  ): Promise<CategorySummary | null> {
    let currentCategory: CategorySummary | null = category;

    while (currentCategory) {
      if ((currentCategory.featuredFacetKeys?.length ?? 0) > 0) {
        return currentCategory;
      }

      if (!currentCategory.parentId) {
        return currentCategory;
      }

      currentCategory = await this.categoryRepository.findById(currentCategory.parentId);
    }

    return null;
  }

  private async resolveFacetAttributeForDisplay({
    category,
    featuredFacetCategory,
    facetKey,
  }: {
    category: CategorySummary | null;
    featuredFacetCategory: CategorySummary | null;
    facetKey: string;
  }): Promise<CategorySummary['attributes'][number] | null> {
    const currentCategoryMatch = category?.attributes.find((item) => item.key === facetKey) ?? null;
    const featuredCategoryMatch = featuredFacetCategory?.attributes.find((item) => item.key === facetKey) ?? null;
    const directMatch = currentCategoryMatch ?? featuredCategoryMatch;

    if ((currentCategoryMatch?.options.length ?? 0) > 0) {
      return currentCategoryMatch;
    }

    if ((featuredCategoryMatch?.options.length ?? 0) > 0) {
      return featuredCategoryMatch;
    }

    if (directMatch) {
      // Keep searching when the local definition exists but has no taxonomy options.
      // This happens on branch categories whose descendants define the real choices.
    }

    if (!category) {
      return directMatch;
    }

    const pendingCategoryIds = [category.id];
    const visitedCategoryIds = new Set<string>(pendingCategoryIds);

    while (pendingCategoryIds.length > 0) {
      const parentId = pendingCategoryIds.shift();

      if (!parentId) {
        continue;
      }

      const children = await this.categoryRepository.findAllByParentId(parentId);

      for (const child of children) {
        const childAttribute = child.attributes.find((item) => item.key === facetKey);

        if (childAttribute) {
          return childAttribute;
        }

        if (visitedCategoryIds.has(child.id)) {
          continue;
        }

        visitedCategoryIds.add(child.id);
        pendingCategoryIds.push(child.id);
      }
    }

    return directMatch;
  }

  private async resolveFacetTaxonomyOptions({
    category,
    featuredFacetCategory,
    facetKey,
  }: {
    category: CategorySummary | null;
    featuredFacetCategory: CategorySummary | null;
    facetKey: string;
  }): Promise<PublicProductFacetOption[]> {
    const options = new Map<string, PublicProductFacetOption>();
    const categories = new Map<string, CategorySummary>();

    if (category) {
      categories.set(category.id, category);
    }

    if (featuredFacetCategory) {
      categories.set(featuredFacetCategory.id, featuredFacetCategory);
    }

    if (category) {
      const leafCategories = await this.resolveLeafCategories(category);

      leafCategories.forEach((leafCategory) => {
        categories.set(leafCategory.id, leafCategory);
      });
    }

    categories.forEach((candidateCategory) => {
      candidateCategory.attributes
        .filter((attribute) => attribute.key === facetKey)
        .flatMap((attribute) => attribute.options)
        .forEach((option) => {
          const canonicalOption = toCanonicalFacetOption(facetKey, option.value);
          options.set(canonicalOption.optionKey, canonicalOption);
        });
    });

    return Array.from(options.values())
      .sort((left, right) => left.value.localeCompare(right.value));
  }

  private async resolveQueryCategoryIds(categoryId?: string): Promise<string[] | undefined> {
    return categoryId
      ? this.resolveCategorySubtreeIds(categoryId)
      : undefined;
  }

  private async resolveCategorySubtreeIds(categoryId: string): Promise<string[]> {
    const category = await this.categoryRepository.findById(categoryId);

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

      const children = await this.categoryRepository.findAllByParentId(parentId);

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

  private async resolveLeafCategories(category: CategorySummary): Promise<CategorySummary[]> {
    const leaves: CategorySummary[] = [];
    const pendingCategories: CategorySummary[] = [category];

    while (pendingCategories.length > 0) {
      const currentCategory = pendingCategories.shift();

      if (!currentCategory) {
        continue;
      }

      const children = await this.categoryRepository.findAllByParentId(currentCategory.id);

      if (children.length === 0) {
        leaves.push(currentCategory);
        continue;
      }

      pendingCategories.push(...children);
    }

    return leaves;
  }
}

function mergeFacetOptions(
  currentOptions: PublicProductFacetOption[],
  taxonomyOptions: PublicProductFacetOption[]
): PublicProductFacetOption[] {
  const options = new Map<string, PublicProductFacetOption>();

  [...taxonomyOptions, ...currentOptions].forEach((option) => {
    options.set(option.optionKey, option);
  });

  return Array.from(options.values())
    .sort((left, right) => left.value.localeCompare(right.value));
}

function compareFacetNames(
  left: Pick<PublicProductFacet, 'attributeName'>,
  right: Pick<PublicProductFacet, 'attributeName'>
): number {
  return left.attributeName.localeCompare(right.attributeName);
}
