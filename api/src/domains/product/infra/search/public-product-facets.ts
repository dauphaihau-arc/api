import { PUBLIC_PRODUCT_FACET_PRIORITY } from '../../app/product-facet.constants';
import { toCanonicalFacetOption } from '../../app/shoe-size-groups';
import type {
  ListPublicProductsInput,
  PublicProductFacet,
} from '../../app/product.types';

/**
 * One grouped row from a storefront facet aggregation. The `attributeKey` is
 * the stable public facet identity; the `attributeName` is only a display
 * label and never the merge key.
 */
export interface FacetAggregationRow {
  _id: {
    attributeKey: string;
    attributeName: string;
    optionValue: string;
  };
}

/**
 * A facet aggregation plus the single facet whose own filter it excludes.
 * `excludedFacetKey === null` is the full-filter run used for every facet that
 * has no active selection.
 */
export interface FacetFilterVariant {
  excludedFacetKey: string | null;
  input: ListPublicProductsInput;
}

/**
 * Builds the facet aggregation inputs.
 *
 * A facet's alternatives must honor every active filter except its own, so a
 * selected facet can still offer its other options. Facets without a selection
 * are served by the full-filter run. The first variant is always the full run.
 */
export function buildFacetFilterVariants(
  input: ListPublicProductsInput,
): FacetFilterVariant[] {
  const activeFacetKeys = Array.from(new Set(
    (input.attributeFilters ?? [])
      .map((attributeFilter) => attributeFilter.attributeId)
      .filter((attributeId): attributeId is string =>
        typeof attributeId === 'string' && attributeId.length > 0),
  ));

  return [
    { excludedFacetKey: null, input },
    ...activeFacetKeys.map((excludedFacetKey) => ({
      excludedFacetKey,
      input: {
        ...input,
        attributeFilters: input.attributeFilters?.filter(
          (attributeFilter) => attributeFilter.attributeId !== excludedFacetKey,
        ),
      },
    })),
  ];
}

/**
 * The aggregation body shared by every adapter: unwind the projected attribute
 * rows, keep only complete rows, group by `(attributeKey, attributeName,
 * optionValue)`, and order deterministically. `firstStage` is the adapter's own
 * match (`$match` for the projected Mongo collection, `$search` for Atlas).
 */
export function buildFacetAggregationPipeline(
  firstStage: Record<string, unknown>,
): Record<string, unknown>[] {
  return [
    firstStage,
    { $unwind: '$attributes' },
    {
      $match: {
        'attributes.categoryAttributeName': { $exists: true, $ne: null },
        'attributes.categoryAttributeKey': { $exists: true, $ne: null },
        'attributes.selectedOptionValue': { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: {
          attributeKey: '$attributes.categoryAttributeKey',
          attributeName: '$attributes.categoryAttributeName',
          optionValue: '$attributes.selectedOptionValue',
        },
      },
    },
    {
      $sort: {
        '_id.attributeName': 1,
        '_id.optionValue': 1,
      },
    },
  ];
}

/**
 * Folds grouped rows into public facets.
 *
 * Rows merge by the stable facet key, never by the display label, so distinct
 * attributes that share a label stay distinct and the option union is not
 * shaped by label equality. Every option key is canonicalized (shoe sizes fold
 * their aliases). On a stable-key collision — one key contributed by more than
 * one attribute identity — the display name is resolved deterministically to
 * the lexicographically smallest label instead of depending on row arrival
 * order.
 */
export function foldFacetRows(rows: FacetAggregationRow[]): PublicProductFacet[] {
  const facets = new Map<string, PublicProductFacet>();

  rows.forEach((row) => {
    const option = toCanonicalFacetOption(row._id.attributeKey, row._id.optionValue);
    const existingFacet = facets.get(row._id.attributeKey);

    if (!existingFacet) {
      facets.set(row._id.attributeKey, {
        facetKey: row._id.attributeKey,
        attributeName: row._id.attributeName,
        options: [option],
      });
      return;
    }

    if (!existingFacet.options.some((candidate) => candidate.optionKey === option.optionKey)) {
      existingFacet.options.push(option);
    }

    if (row._id.attributeName.localeCompare(existingFacet.attributeName) < 0) {
      existingFacet.attributeName = row._id.attributeName;
    }
  });

  return Array.from(facets.values()).sort(comparePublicFacetNames);
}

/**
 * Merges the full-filter run with each per-facet exclusion run.
 *
 * Only the excluded facet is taken from its own run; every other facet keeps
 * the full-filter result so it continues to honor the active selection.
 */
export function mergeFacetFilterVariants(
  variants: FacetFilterVariant[],
  rowsByVariant: FacetAggregationRow[][],
): PublicProductFacet[] {
  const facetsByKey = new Map(
    foldFacetRows(rowsByVariant[0] ?? []).map((facet) => [facet.facetKey, facet]),
  );

  variants.forEach((variant, index) => {
    if (!variant.excludedFacetKey) {
      return;
    }

    const includedRows = (rowsByVariant[index] ?? []).filter(
      (row) => row._id.attributeKey === variant.excludedFacetKey,
    );
    const [facet] = foldFacetRows(includedRows);

    if (facet) {
      facetsByKey.set(facet.facetKey, facet);
    }
  });

  return Array.from(facetsByKey.values()).sort(comparePublicFacetNames);
}

function comparePublicFacetNames(
  left: Pick<PublicProductFacet, 'attributeName'>,
  right: Pick<PublicProductFacet, 'attributeName'>,
): number {
  const leftIndex = PUBLIC_PRODUCT_FACET_PRIORITY.indexOf(left.attributeName as never);
  const rightIndex = PUBLIC_PRODUCT_FACET_PRIORITY.indexOf(right.attributeName as never);
  const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

  if (normalizedLeftIndex !== normalizedRightIndex) {
    return normalizedLeftIndex - normalizedRightIndex;
  }

  return left.attributeName.localeCompare(right.attributeName);
}
