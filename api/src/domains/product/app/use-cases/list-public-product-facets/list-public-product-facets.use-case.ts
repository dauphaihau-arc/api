import { Injectable } from '@nestjs/common';
import type { CategorySummary } from '~/domains/category/app/category.types';
import { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { toCanonicalFacetOption } from '../../shoe-size-groups';
import { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type {
  PublicProductFacet,
  PublicProductFacetOption,
} from '../../product.types';
import {
  type ListPublicProductsQuery,
  resolveQueryCategoryIds,
  toListPublicProductsInput,
} from '../list-public-products/list-public-products.query';

@Injectable()
export class ListPublicProductFacetsUseCase {
  constructor(
    private readonly productRepository: StorefrontProductQueryRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async execute(query: ListPublicProductsQuery): Promise<PublicProductFacet[]> {
    const anchorCategory = query.categoryId
      ? await this.categoryRepository.findByPublicId(query.categoryId)
      : null;

    if (query.categoryId && !anchorCategory) {
      return [];
    }

    const taxonomyCategories = anchorCategory
      ? await this.categoryRepository.findSelfAndDescendants?.(anchorCategory.id) ?? null
      : null;

    if (anchorCategory && taxonomyCategories?.length === 0) {
      return [];
    }

    const category = taxonomyCategories?.[0] ?? anchorCategory;

    const featuredFacetCategory = category
      ? await this.resolveFeaturedFacetCategory(category)
      : null;

    const categoryIds = taxonomyCategories
      ? taxonomyCategories.map((item) => item.id)
      : query.categoryId
        ? await resolveQueryCategoryIds(
          this.categoryRepository,
          query.categoryId,
        )
        : undefined;

    if (query.categoryId && categoryIds?.length === 0) {
      return [];
    }

    const facets = await this.productRepository.listPublicFacets(
      toListPublicProductsInput(query, categoryIds),
    );

    return this.mergeFeaturedFacets({
      category,
      featuredFacetCategory,
      facets,
      taxonomyCategories,
      attributeFilters: query.attributeFilters,
    });
  }

  private async mergeFeaturedFacets({
    category,
    featuredFacetCategory,
    facets,
    taxonomyCategories,
    attributeFilters,
  }: {
    category: CategorySummary | null;
    featuredFacetCategory: CategorySummary | null;
    facets: PublicProductFacet[];
    taxonomyCategories: CategorySummary[] | null;
    attributeFilters?: ListPublicProductsQuery['attributeFilters'];
  }): Promise<PublicProductFacet[]> {
    const featuredFacetKeys = featuredFacetCategory?.featuredFacetKeys ?? [];
    const featuredFacetKeySet = new Set(featuredFacetKeys);

    const leafCategories = category
      ? await this.resolveLeafCategories(category, taxonomyCategories)
      : [];

    const subtreeFacetKeys = category
      ? this.resolveCommonLeafFacetKeys(leafCategories)
      : [];

    const taxonomyFacetKeys = Array.from(new Set([
      ...featuredFacetKeys,
      ...subtreeFacetKeys,
    ]));

    const selectedOptionKeysByFacet = buildSelectedOptionKeysByFacet(attributeFilters);

    const facetsByKey = new Map<string, PublicProductFacet>(
      facets.map((facet) => [facet.facetKey, { ...facet, options: [...facet.options] }]),
    );

    for (const facetKey of taxonomyFacetKeys) {
      const taxonomyOptions = await this.resolveFacetTaxonomyOptions({
        category,
        featuredFacetCategory,
        facetKey,
        leafCategories,
      });

      // The configured taxonomy supplies the facet identity (key), the display
      // name for a configured-only facet, and the label for a shopper's own
      // selection. It must not add alternatives that no eligible product
      // matches: live option membership governs the offered choices once
      // filters are active.
      const selectedOptions = pickSelectedOptions(
        facetKey,
        taxonomyOptions,
        selectedOptionKeysByFacet.get(facetKey) ?? [],
      );

      const existingFacet = facetsByKey.get(facetKey);

      if (!existingFacet) {
        if (selectedOptions.length === 0 && !featuredFacetKeySet.has(facetKey)) {
          continue;
        }

        const attribute = await this.resolveFacetAttributeForDisplay({
          category,
          featuredFacetCategory,
          facetKey,
          taxonomyCategories,
        });

        facetsByKey.set(facetKey, {
          facetKey,
          attributeName: attribute?.name ?? facetKey,
          options: selectedOptions,
        });
        continue;
      }

      // A live facet keeps the repository's label: it resolves a stable-key
      // collision deterministically over the product rows, so the exposed label
      // never depends on this traversal order.
      existingFacet.options = mergeFacetOptions(existingFacet.options, selectedOptions);
    }

    return Array.from(facetsByKey.values())
      .filter((facet) => facet.options.length > 0 || featuredFacetKeySet.has(facet.facetKey))
      .sort(compareFacetNames);
  }

  private resolveCommonLeafFacetKeys(leafCategories: CategorySummary[]): string[] {
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
    category: CategorySummary,
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
    taxonomyCategories,
  }: {
    category: CategorySummary | null;
    featuredFacetCategory: CategorySummary | null;
    facetKey: string;
    taxonomyCategories: CategorySummary[] | null;
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

    if (taxonomyCategories) {
      for (const child of collectDescendants(category.id, taxonomyCategories)) {
        const childAttribute = child.attributes.find((item) => item.key === facetKey);

        if (childAttribute) {
          return childAttribute;
        }
      }

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
    leafCategories,
  }: {
    category: CategorySummary | null;
    featuredFacetCategory: CategorySummary | null;
    facetKey: string;
    leafCategories: CategorySummary[];
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

  private async resolveLeafCategories(
    category: CategorySummary,
    taxonomyCategories: CategorySummary[] | null,
  ): Promise<CategorySummary[]> {
    if (taxonomyCategories) {
      const childrenByParentId = buildChildrenByParentId(taxonomyCategories);

      return taxonomyCategories
        .filter((candidateCategory) => (childrenByParentId.get(candidateCategory.id) ?? []).length === 0);
    }

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
  taxonomyOptions: PublicProductFacetOption[],
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
  right: Pick<PublicProductFacet, 'attributeName'>,
): number {
  return left.attributeName.localeCompare(right.attributeName);
}

/**
 * The shopper's own selections per facet key. `selected_option_keys` are the
 * canonical public keys; `selected_option_values` are the display values the
 * public query surface also carries, so both are folded into one key set.
 */
function buildSelectedOptionKeysByFacet(
  attributeFilters?: ListPublicProductsQuery['attributeFilters'],
): Map<string, string[]> {
  const selectedOptionKeysByFacet = new Map<string, string[]>();

  (attributeFilters ?? []).forEach((attributeFilter) => {
    const facetKey = attributeFilter.attribute_id?.trim();

    if (!facetKey) {
      return;
    }

    const optionKeys = [
      ...(attributeFilter.selected_option_keys ?? []),
      ...(attributeFilter.selected_option_values ?? []),
    ]
      .map((optionKey) => optionKey.trim())
      .filter(Boolean);

    if (optionKeys.length === 0) {
      return;
    }

    selectedOptionKeysByFacet.set(
      facetKey,
      Array.from(new Set([...(selectedOptionKeysByFacet.get(facetKey) ?? []), ...optionKeys])),
    );
  });

  return selectedOptionKeysByFacet;
}

/**
 * Resolves the shopper's own selections into public options so a selected
 * choice always stays visible (and deselectable), using the configured
 * taxonomy for its display label when one exists.
 */
function pickSelectedOptions(
  facetKey: string,
  taxonomyOptions: PublicProductFacetOption[],
  selectedOptionKeys: string[],
): PublicProductFacetOption[] {
  const taxonomyOptionByKey = new Map(
    taxonomyOptions.map((option) => [option.optionKey, option]),
  );
  const optionsByKey = new Map<string, PublicProductFacetOption>();

  selectedOptionKeys.forEach((optionKey) => {
    const canonicalOption = toCanonicalFacetOption(facetKey, optionKey);
    const resolvedOption = taxonomyOptionByKey.get(canonicalOption.optionKey) ?? canonicalOption;
    optionsByKey.set(resolvedOption.optionKey, resolvedOption);
  });

  return Array.from(optionsByKey.values());
}

function buildChildrenByParentId(categories: CategorySummary[]): Map<string, CategorySummary[]> {
  const childrenByParentId = new Map<string, CategorySummary[]>();

  for (const category of categories) {
    if (!category.parentId) {
      continue;
    }

    const children = childrenByParentId.get(category.parentId) ?? [];
    children.push(category);
    childrenByParentId.set(category.parentId, children);
  }

  return childrenByParentId;
}

function collectDescendants(
  categoryId: string,
  categories: CategorySummary[],
): CategorySummary[] {
  const childrenByParentId = buildChildrenByParentId(categories);
  const descendants: CategorySummary[] = [];
  const pendingCategories = [...(childrenByParentId.get(categoryId) ?? [])];
  const visitedCategoryIds = new Set<string>([categoryId]);

  while (pendingCategories.length > 0) {
    const category = pendingCategories.shift();

    if (!category || visitedCategoryIds.has(category.id)) {
      continue;
    }

    visitedCategoryIds.add(category.id);
    descendants.push(category);
    pendingCategories.push(...(childrenByParentId.get(category.id) ?? []));
  }

  return descendants;
}
