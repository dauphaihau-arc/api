import type { PinoLogger } from 'nestjs-pino';
import type { CatalogConfig } from '~/platform/config/catalog.config';
import type { StorefrontPricingConfig } from '~/platform/config/storefront-pricing.config';
import { AtlasSearchStorefrontProductQueryRepository } from './atlas-search-storefront-product-query.repository';
import type { FacetAggregationRow } from '../../public-product-facets';

function row(attributeKey: string, attributeName: string, optionValue: string): FacetAggregationRow {
  return { _id: { attributeKey, attributeName, optionValue } };
}

/**
 * True when the aggregation pipeline carries an Atlas equality filter for the
 * given attribute key. This inspects the query the adapter sends to its data
 * store (its public contract), not a private builder.
 */
function filtersAttributeKey(pipeline: unknown[], attributeKey: string): boolean {
  const serialized = JSON.stringify(pipeline);

  return serialized.includes(`"path":"attributes.categoryAttributeKey","value":"${attributeKey}"`);
}

function createRepository(aggregate: jest.Mock) {
  return new AtlasSearchStorefrontProductQueryRepository(
    {
      searchDriver: 'atlas',
      mongodbSearchCollection: 'catalog_product_search',
    } as CatalogConfig,
    { indexedPricePairs: [], rarePriceCacheTtlMs: 0 } as StorefrontPricingConfig,
    { info: jest.fn() } as unknown as PinoLogger,
    {} as never,
    {} as never,
    { getCollection: async () => ({ aggregate }) } as never,
    { resolveCurrentRequest: async () => undefined } as never,
    {} as never,
    {} as never,
  );
}

function buildRepository(aggregateResults: FacetAggregationRow[][]) {
  const pipelines: unknown[][] = [];
  const aggregate = jest.fn((pipeline: unknown[]) => {
    pipelines.push(pipeline);
    return { toArray: async () => aggregateResults.shift() ?? [] };
  });

  return { repository: createRepository(aggregate), aggregate, pipelines };
}

/**
 * Adapter-level parity for the Atlas search flavour. Atlas cannot run in local
 * verification, so this asserts the queries the adapter issues: one search per
 * facet-exclusion variant, each dropping only its own facet filter, merged into
 * the public facet result.
 */
describe('AtlasSearchStorefrontProductQueryRepository facet variants', () => {
  it('runs the full search once and returns the merged facets when no facet is selected', async () => {
    const { repository, aggregate, pipelines } = buildRepository([
      [row('brand', 'Brand', 'Aurora')],
    ]);

    await expect(repository.listPublicFacets({ page: 1, limit: 16 })).resolves.toEqual([
      { facetKey: 'brand', attributeName: 'Brand', options: [{ optionKey: 'aurora', value: 'Aurora' }] },
    ]);

    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(filtersAttributeKey(pipelines[0], 'brand')).toBe(false);
  });

  it('excludes only the selected facet filter from its own search', async () => {
    const { repository, aggregate, pipelines } = buildRepository([
      [row('color', 'Color', 'Black'), row('material', 'Material', 'Cotton')],
      [
        row('color', 'Color', 'Black'),
        row('color', 'Color', 'White'),
        row('material', 'Material', 'Cotton'),
        row('material', 'Material', 'Linen'),
      ],
    ]);

    const facets = await repository.listPublicFacets({
      page: 1,
      limit: 16,
      attributeFilters: [{
        attributeId: 'color',
        attributeName: 'Color',
        selectedOptionKeys: ['black'],
        selectedOptionValues: ['Black'],
      }],
    });

    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(filtersAttributeKey(pipelines[0], 'color')).toBe(true);
    expect(filtersAttributeKey(pipelines[1], 'color')).toBe(false);

    expect(facets).toEqual([
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

  it('runs one search per excluded facet variant', async () => {
    const { repository, aggregate, pipelines } = buildRepository([[], [], []]);

    await repository.listPublicFacets({
      page: 1,
      limit: 16,
      attributeFilters: [
        {
          attributeId: 'color', attributeName: 'Color', selectedOptionKeys: ['black'], selectedOptionValues: ['Black'], 
        },
        {
          attributeId: 'material', attributeName: 'Material', selectedOptionKeys: ['cotton'], selectedOptionValues: ['Cotton'], 
        },
      ],
    });

    expect(aggregate).toHaveBeenCalledTimes(3);
    expect(filtersAttributeKey(pipelines[1], 'color')).toBe(false);
    expect(filtersAttributeKey(pipelines[1], 'material')).toBe(true);
    expect(filtersAttributeKey(pipelines[2], 'material')).toBe(false);
    expect(filtersAttributeKey(pipelines[2], 'color')).toBe(true);
  });

  it('runs facet aggregations one at a time for a client-controlled key set', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const aggregate = jest.fn(() => ({
      toArray: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 1);
        await promise;
        inFlight -= 1;
        return [];
      },
    }));
    const repository = createRepository(aggregate);

    await repository.listPublicFacets({
      page: 1,
      limit: 16,
      attributeFilters: ['color', 'material', 'gender', 'style'].map((attributeId) => ({
        attributeId,
        attributeName: attributeId,
        selectedOptionKeys: [`${attributeId}_option`],
        selectedOptionValues: [`${attributeId} option`],
      })),
    });

    // One full-filter run plus one exclusion run per selected facet, all
    // executed sequentially so the fanout never exceeds one query.
    expect(aggregate).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBe(1);
  });
});
