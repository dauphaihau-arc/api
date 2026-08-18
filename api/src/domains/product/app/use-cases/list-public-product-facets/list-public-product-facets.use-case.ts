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
    const taxonomyCategories = query.categoryId
      ? await this.categoryRepository.findSelfAndDescendants?.(query.categoryId) ?? null
      : null;

    if (query.categoryId && taxonomyCategories?.length === 0) {
      return [];
    }

    const category = taxonomyCategories?.[0] ?? (query.categoryId
      ? await this.categoryRepository.findById(query.categoryId)
      : null);

    const featuredFacetCategory = category
      ? await this.resolveFeaturedFacetCategory(category)
      : null;

    const categoryIds = taxonomyCategories
      ? taxonomyCategories.map((item) => item.id)
      : await resolveQueryCategoryIds(
        this.categoryRepository,
        query.categoryId,
      );

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
    });
  }

  private async mergeFeaturedFacets({
    category,
    featuredFacetCategory,
    facets,
    taxonomyCategories,
  }: {
    category: CategorySummary | null;
    featuredFacetCategory: CategorySummary | null;
    facets: PublicProductFacet[];
    taxonomyCategories: CategorySummary[] | null;
  }): Promise<PublicProductFacet[]> {
    const featuredFacetKeys = featuredFacetCategory?.featuredFacetKeys ?? [];
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
        taxonomyCategories,
      });

      const taxonomyOptions = await this.resolveFacetTaxonomyOptions({
        category,
        featuredFacetCategory,
        facetKey,
        leafCategories,
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
