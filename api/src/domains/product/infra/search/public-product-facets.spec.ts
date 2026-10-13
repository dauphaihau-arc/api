import type { ListPublicProductsInput } from '../../app/product.types';
import {
  buildFacetFilterVariants,
  foldFacetRows,
  mergeFacetFilterVariants,
  type FacetAggregationRow,
} from './public-product-facets';

function row(attributeKey: string, attributeName: string, optionValue: string): FacetAggregationRow {
  return { _id: { attributeKey, attributeName, optionValue } };
}

function input(overrides: Partial<ListPublicProductsInput> = {}): ListPublicProductsInput {
  return { page: 1, limit: 16, ...overrides };
}

describe('buildFacetFilterVariants', () => {
  it('uses a single full-filter variant when no facet is selected', () => {
    const variants = buildFacetFilterVariants(input());

    expect(variants).toEqual([{ excludedFacetKey: null, input: input() }]);
  });

  it('adds one exclusion variant per selected facet and keeps other filters', () => {
    const variants = buildFacetFilterVariants(input({
      categoryIds: ['category-1'],
      minPriceMinor: 1000,
      attributeFilters: [
        {
          attributeId: 'color', attributeName: 'Color', selectedOptionKeys: ['black'], selectedOptionValues: ['Black'], 
        },
        {
          attributeId: 'material', attributeName: 'Material', selectedOptionKeys: ['cotton'], selectedOptionValues: ['Cotton'], 
        },
      ],
    }));

    expect(variants.map((variant) => variant.excludedFacetKey)).toEqual([null, 'color', 'material']);
    expect(variants[1].input.attributeFilters).toEqual([
      {
        attributeId: 'material', attributeName: 'Material', selectedOptionKeys: ['cotton'], selectedOptionValues: ['Cotton'], 
      },
    ]);
    expect(variants[1].input.categoryIds).toEqual(['category-1']);
    expect(variants[1].input.minPriceMinor).toBe(1000);
    expect(variants[2].input.attributeFilters).toEqual([
      {
        attributeId: 'color', attributeName: 'Color', selectedOptionKeys: ['black'], selectedOptionValues: ['Black'], 
      },
    ]);
  });
});

describe('mergeFacetFilterVariants', () => {
  it('keeps the excluded facet alternatives while other facets honor the selection', () => {
    // Selected Color=Black. The full run only sees black products; the
    // color-excluded run sees every product the other filters allow.
    const fullRun: FacetAggregationRow[] = [
      row('color', 'Color', 'Black'),
      row('material', 'Material', 'Cotton'),
    ];
    const colorExcludedRun: FacetAggregationRow[] = [
      row('color', 'Color', 'Black'),
      row('color', 'Color', 'White'),
      row('material', 'Material', 'Cotton'),
      row('material', 'Material', 'Linen'),
    ];

    const variants = buildFacetFilterVariants(input({
      attributeFilters: [
        {
          attributeId: 'color', attributeName: 'Color', selectedOptionKeys: ['black'], selectedOptionValues: ['Black'], 
        },
      ],
    }));

    expect(mergeFacetFilterVariants(variants, [fullRun, colorExcludedRun])).toEqual([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [
          { optionKey: 'black', value: 'Black' },
          { optionKey: 'white', value: 'White' },
        ],
      },
      {
        facetKey: 'material',
        attributeName: 'Material',
        options: [{ optionKey: 'cotton', value: 'Cotton' }],
      },
    ]);
  });

  it('resolves a stable-key collision deterministically instead of merging by arrival order', () => {
    const fullRun: FacetAggregationRow[] = [
      row('material', 'Zzz Material', 'Cotton'),
      row('material', 'Aaa Material', 'Linen'),
    ];

    const [facet] = mergeFacetFilterVariants(
      [{ excludedFacetKey: null, input: input() }],
      [fullRun],
    );

    expect(facet).toEqual({
      facetKey: 'material',
      attributeName: 'Aaa Material',
      options: [
        { optionKey: 'cotton', value: 'Cotton' },
        { optionKey: 'linen', value: 'Linen' },
      ],
    });
  });
});

describe('foldFacetRows', () => {
  it('keeps attributes with the same label but distinct stable keys separate', () => {
    expect(foldFacetRows([
      row('color', 'Color', 'Black'),
      row('colour', 'Color', 'White'),
    ])).toEqual([
      { facetKey: 'color', attributeName: 'Color', options: [{ optionKey: 'black', value: 'Black' }] },
      { facetKey: 'colour', attributeName: 'Color', options: [{ optionKey: 'white', value: 'White' }] },
    ]);
  });

  it('canonicalizes shoe-size option aliases into one option', () => {
    expect(foldFacetRows([
      row('shoe_size', 'Size', 'US 6.5'),
      row('shoe_size', 'Size', 'EU 39'),
    ])).toEqual([
      { facetKey: 'shoe_size', attributeName: 'Size', options: [{ optionKey: 'us_6_5_eu_39', value: 'US 6.5 / EU 39' }] },
    ]);
  });
});
