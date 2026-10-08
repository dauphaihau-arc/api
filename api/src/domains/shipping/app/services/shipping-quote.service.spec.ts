import { ProductState } from '../../../product/domain/enums/product-state.enum';
import { ShippingDestinationScope } from '../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../domain/enums/shipping-profile-status.enum';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import type { ShippingProfileSummary } from '../shipping.types';
import { ShippingQuoteService } from './shipping-quote.service';

function buildProfile(
  id: string,
  overrides: Partial<ShippingProfileSummary> = {},
): ShippingProfileSummary {
  return {
    id,
    shopId: 'shop-1',
    shopPublicId: 'shop_public-1',
    name: `Profile ${id}`,
    status: ShippingProfileStatus.ACTIVE,
    version: 1,
    isDefault: false,
    shopCurrency: 'USD',
    shipFromCountry: 'US',
    processingTimeMinDays: 1,
    processingTimeMaxDays: 3,
    rates: [
      {
        id: `${id}-us`,
        position: 1,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
        oneItemFeeMinor: 599,
        additionalItemFeeMinor: 199,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 5,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService(input: {
  assignments: Array<{
    productId: string;
    shippingProfileId?: string;
    productState: ProductState;
    isDigital?: boolean;
  }>;
  profiles: ShippingProfileSummary[];
  /** Exchange rates keyed `FROM:TO`, as the canonical seam would return them. */
  rates?: Record<string, string>;
}) {
  const shippingProfileRepository = {
    findByIds: jest.fn().mockResolvedValue(input.profiles),
  };
  const productShippingAssignmentPort = {
    listByProductIds: jest.fn().mockResolvedValue(
      input.assignments.map((assignment) => ({
        ...assignment,
        isDigital: assignment.isDigital ?? false,
      })),
    ),
    listByShippingProfileIds: jest.fn(),
  };
  const fxRateService = {
    getLatestRate: jest.fn(async ({ fromCurrency, toCurrency, at }: {
      fromCurrency: string;
      toCurrency: string;
      at?: Date;
    }) => {
      if (fromCurrency === toCurrency) {
        return {
          fromCurrency,
          toCurrency,
          rate: '1',
          effectiveAt: at ?? new Date(),
          source: 'identity',
        };
      }

      const rate = input.rates?.[`${fromCurrency}:${toCurrency}`];

      if (!rate) {
        return null;
      }

      return {
        fromCurrency,
        toCurrency,
        rate,
        effectiveAt: new Date('2026-09-22T00:00:00.000Z'),
        source: 'test-rates',
        sourceTimestamp: new Date('2026-09-22T00:00:00.000Z'),
      };
    }),
  };
  const service = new ShippingQuoteService(
    shippingProfileRepository as never,
    productShippingAssignmentPort as never,
    new MoneyConversionService(fxRateService as never, new RoundingPolicyService()),
  );

  return { service, shippingProfileRepository, fxRateService };
}

describe('ShippingQuoteService', () => {
  it('resolves each Product to its assigned profile rate for the destination', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [buildProfile('profile-1')],
    });

    const resolutions = await service.resolveForProducts({
      productIds: ['product-1'],
      destination: { countryCode: 'us' },
    });

    expect(resolutions).toEqual([
      {
        productId: 'product-1',
        profileId: 'profile-1',
        profileName: 'Profile profile-1',
        profileVersion: 1,
        profileShopId: 'shop-1',
        isDigital: false,
        available: true,
        readinessIssues: [],
        currency: 'USD',
        rate: expect.objectContaining({ destinationCountry: 'US', oneItemFeeMinor: 599 }),
        // Ticket 09 anchors these with its own quote timestamp through the
        // shared calculator instead of reading them from a Product fallback.
        processingTime: { minDays: 1, maxDays: 3 },
        deliveryTime: { minDays: 3, maxDays: 5 },
      },
    ]);
  });

  it('marks an unassigned Product unavailable instead of falling back', async () => {
    const { service } = buildService({ assignments: [], profiles: [] });

    const [resolution] = await service.resolveForProducts({
      productIds: ['product-1'],
      destination: { countryCode: 'US' },
    });

    expect(resolution).toMatchObject({
      productId: 'product-1',
      available: false,
      reason: 'missing_assignment',
      readinessIssues: [],
    });
    expect(resolution.rate).toBeUndefined();
  });

  it('marks a draft or archived profile unavailable with its readiness issues', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.DRAFT },
      ],
      profiles: [buildProfile('profile-1', {
        status: ShippingProfileStatus.DRAFT,
        rates: [],
      })],
    });

    const [resolution] = await service.resolveForProducts({
      productIds: ['product-1'],
      destination: { countryCode: 'US' },
    });

    expect(resolution).toMatchObject({
      available: false,
      reason: 'profile_not_ready',
      readinessIssues: ['draft', 'missing_rates'],
    });
    expect(resolution.rate).toBeUndefined();
  });

  it('marks a destination outside the profile coverage unavailable', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [buildProfile('profile-1')],
    });

    const [resolution] = await service.resolveForProducts({
      productIds: ['product-1'],
      destination: { countryCode: 'DE' },
    });

    expect(resolution).toMatchObject({
      available: false,
      reason: 'unsupported_destination',
    });
  });

  it('reports a profile that disappeared before the quote resolved', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-gone', productState: ProductState.ACTIVE },
      ],
      profiles: [],
    });

    const [resolution] = await service.resolveForProducts({
      productIds: ['product-1'],
      destination: { countryCode: 'US' },
    });

    expect(resolution).toMatchObject({ available: false, reason: 'profile_not_found' });
  });

  it('reports distinct ship-from countries as confirmed-order dispatch context', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-2', shippingProfileId: 'profile-2', productState: ProductState.ACTIVE },
        { productId: 'product-3', shippingProfileId: 'profile-3', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-1', { shipFromCountry: 'US' }),
        buildProfile('profile-2', { shipFromCountry: 'VN' }),
        buildProfile('profile-3', { shipFromCountry: undefined }),
      ],
    });

    await expect(service.listOriginCountries(['product-1', 'product-2', 'product-3']))
      .resolves.toEqual(['US', 'VN']);
  });
});

describe('ShippingQuoteService.quoteForCheckout', () => {
  const anchorAt = new Date('2026-09-22T10:15:00.000Z');

  it('charges the highest one-item fee once plus the additional-item fee for every remaining unit', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-a', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-b', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-1', {
          rates: [
            {
              id: 'rate-1',
              position: 1,
              destinationScope: ShippingDestinationScope.COUNTRY,
              destinationCountry: 'US',
              oneItemFeeMinor: 900,
              additionalItemFeeMinor: 250,
              deliveryTimeMinDays: 3,
              deliveryTimeMaxDays: 5,
            },
          ],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-b', inventoryId: 'inv-b', quantity: 2, 
        },
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-a', quantity: 1, 
        },
      ],
    });

    expect(quote.unavailable).toEqual([]);
    expect(quote.shops).toHaveLength(1);

    const [shop] = quote.shops;
    expect(shop.currency).toBe('USD');
    expect(shop.charge).toMatchObject({
      quantity: 3,
      baseUnit: { productId: 'product-a', inventoryId: 'inv-a', oneItemFeeMinor: 900 },
      baseItemFeeMinor: 900,
      baseItemTotalMinor: 900,
      additionalItemsQuantity: 2,
      additionalItemFeeMinorTotal: 500,
      totalMinor: 1400,
    });
    expect(shop.charge.additionalComponents).toEqual([
      {
        productId: 'product-b', inventoryId: 'inv-b', quantity: 2, additionalItemFeeMinor: 250, 
      },
    ]);
  });

  it('breaks an equal one-item-fee tie by stable Product then Inventory identity', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-a', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-b', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-1', {
          rates: [
            {
              id: 'rate-1',
              position: 1,
              destinationScope: ShippingDestinationScope.COUNTRY,
              destinationCountry: 'US',
              oneItemFeeMinor: 500,
              additionalItemFeeMinor: 100,
              deliveryTimeMinDays: 3,
              deliveryTimeMaxDays: 5,
            },
          ],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-b', inventoryId: 'inv-b', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-a', quantity: 1, 
        },
      ],
    });

    expect(quote.shops[0]?.charge.baseUnit).toEqual({
      productId: 'product-a',
      inventoryId: 'inv-a',
      oneItemFeeMinor: 500,
    });
  });

  it('calculates each shop independently and never combines rates across sellers', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-a', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-b', shippingProfileId: 'profile-2', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-1', { shopId: 'shop-1' }),
        buildProfile('profile-2', {
          shopId: 'shop-2',
          shopPublicId: 'shop_public-2',
          rates: [
            {
              id: 'rate-2',
              position: 1,
              destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
              oneItemFeeMinor: 1200,
              additionalItemFeeMinor: 0,
              deliveryTimeMinDays: 6,
              deliveryTimeMaxDays: 9,
            },
          ],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-a', quantity: 1, 
        },
        {
          shopId: 'shop-2', productId: 'product-b', inventoryId: 'inv-b', quantity: 3, 
        },
      ],
    });

    expect(quote.shops.map((shop) => ({
      shopId: shop.shopId,
      currency: shop.currency,
      totalMinor: shop.charge.totalMinor,
    }))).toEqual([
      { shopId: 'shop-1', currency: 'USD', totalMinor: 599 },
      { shopId: 'shop-2', currency: 'USD', totalMinor: 1200 },
    ]);
  });

  it('reports unavailable products with their reason and never prices a fallback', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-a', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-draft', shippingProfileId: 'profile-draft', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-1'),
        buildProfile('profile-draft', {
          status: ShippingProfileStatus.DRAFT,
          rates: [],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-a', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-draft', inventoryId: 'inv-draft', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-missing', inventoryId: 'inv-missing', quantity: 2, 
        },
      ],
    });

    expect(quote.unavailable).toEqual([
      {
        productId: 'product-draft',
        inventoryId: 'inv-draft',
        quantity: 1,
        reason: 'profile_not_ready',
        readinessIssues: ['draft', 'missing_rates'],
      },
      {
        productId: 'product-missing',
        inventoryId: 'inv-missing',
        quantity: 2,
        reason: 'missing_assignment',
        readinessIssues: [],
      },
    ]);
    expect(quote.shops).toEqual([]);
  });

  it('anchors the combined estimate at quote creation and widens it across every unit', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-a', shippingProfileId: 'profile-fast', productState: ProductState.ACTIVE },
        { productId: 'product-b', shippingProfileId: 'profile-slow', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-fast', {
          processingTimeMinDays: 1,
          processingTimeMaxDays: 2,
          rates: [
            {
              id: 'rate-fast',
              position: 1,
              destinationScope: ShippingDestinationScope.COUNTRY,
              destinationCountry: 'US',
              oneItemFeeMinor: 400,
              additionalItemFeeMinor: 0,
              deliveryTimeMinDays: 2,
              deliveryTimeMaxDays: 3,
            },
          ],
        }),
        buildProfile('profile-slow', {
          processingTimeMinDays: 2,
          processingTimeMaxDays: 4,
          rates: [
            {
              id: 'rate-slow',
              position: 1,
              destinationScope: ShippingDestinationScope.COUNTRY,
              destinationCountry: 'US',
              oneItemFeeMinor: 600,
              additionalItemFeeMinor: 0,
              deliveryTimeMinDays: 5,
              deliveryTimeMaxDays: 8,
            },
          ],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-a', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-b', inventoryId: 'inv-b', quantity: 1, 
        },
      ],
    });

    expect(quote.shops[0]?.estimate).toEqual({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 4,
      deliveryTimeMinDays: 2,
      deliveryTimeMaxDays: 8,
      combinedMinDays: 3,
      combinedMaxDays: 12,
      anchorAt,
      earliestDeliveryDate: new Date('2026-09-25T00:00:00.000Z'),
      latestDeliveryDate: new Date('2026-10-04T00:00:00.000Z'),
    });
  });

  it('breaks a same-Product tie by stable Variant/Inventory identity', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-a', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-1', {
          rates: [
            {
              id: 'rate-1',
              position: 1,
              destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
              oneItemFeeMinor: 500,
              additionalItemFeeMinor: 100,
              deliveryTimeMinDays: 3,
              deliveryTimeMaxDays: 5,
            },
          ],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-z', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-a', quantity: 2, 
        },
      ],
    });

    expect(quote.shops[0]?.charge).toMatchObject({
      quantity: 3,
      baseUnit: { productId: 'product-a', inventoryId: 'inv-a', oneItemFeeMinor: 500 },
      additionalComponents: [
        {
          productId: 'product-a', inventoryId: 'inv-a', quantity: 1, additionalItemFeeMinor: 100, 
        },
        {
          productId: 'product-a', inventoryId: 'inv-z', quantity: 1, additionalItemFeeMinor: 100, 
        },
      ],
      totalMinor: 700,
    });
  });

  it('snapshots every unit profile, rate, component, and range used by the calculation', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-a', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildProfile('profile-1', {
          version: 7,
          processingTimeMinDays: 1,
          processingTimeMaxDays: 3,
          rates: [
            {
              id: 'rate-1',
              position: 1,
              destinationScope: ShippingDestinationScope.COUNTRY,
              destinationCountry: 'US',
              oneItemFeeMinor: 900,
              additionalItemFeeMinor: 250,
              deliveryTimeMinDays: 3,
              deliveryTimeMaxDays: 5,
            },
          ],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'us' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-a', inventoryId: 'inv-a', quantity: 2, 
        },
      ],
    });

    expect(quote.shops[0]?.units).toEqual([
      {
        productId: 'product-a',
        inventoryId: 'inv-a',
        quantity: 2,
        profileId: 'profile-1',
        profileVersion: 7,
        profileShopId: 'shop-1',
        rateId: 'rate-1',
        rateDestinationScope: ShippingDestinationScope.COUNTRY,
        rateDestinationCountry: 'US',
        rateDestinationRegion: undefined,
        currency: 'USD',
        oneItemFeeMinor: 900,
        additionalItemFeeMinor: 250,
        processingTimeMinDays: 1,
        processingTimeMaxDays: 3,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 5,
      },
    ]);
  });
});

describe('ShippingQuoteService digital Products', () => {
  const anchorAt = new Date('2026-09-22T10:15:00.000Z');

  it('marks a digital Product available without carrier shipping facts', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-digital', productState: ProductState.ACTIVE, isDigital: true },
      ],
      profiles: [],
    });

    await expect(service.resolveForProducts({
      productIds: ['product-digital'],
      destination: { countryCode: 'US' },
    })).resolves.toEqual([
      {
        productId: 'product-digital',
        isDigital: true,
        available: true,
        readinessIssues: [],
      },
    ]);
  });

  it('prices only the physical units of a mixed shop', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-physical', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-digital', productState: ProductState.ACTIVE, isDigital: true },
      ],
      profiles: [
        buildProfile('profile-1', {
          version: 4,
          processingTimeMinDays: 1,
          processingTimeMaxDays: 3,
          rates: [
            {
              id: 'rate-1',
              position: 1,
              destinationScope: ShippingDestinationScope.COUNTRY,
              destinationCountry: 'US',
              oneItemFeeMinor: 900,
              additionalItemFeeMinor: 250,
              deliveryTimeMinDays: 3,
              deliveryTimeMaxDays: 5,
            },
          ],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-digital', inventoryId: 'inv-digital', quantity: 2, 
        },
        {
          shopId: 'shop-1', productId: 'product-physical', inventoryId: 'inv-physical', quantity: 1, 
        },
      ],
    });

    expect(quote.unavailable).toEqual([]);
    expect(quote.shops).toHaveLength(1);

    const [shop] = quote.shops;
    expect(shop.charge).toMatchObject({
      quantity: 1,
      baseUnit: {
        productId: 'product-physical',
        inventoryId: 'inv-physical',
        oneItemFeeMinor: 900,
      },
      totalMinor: 900,
    });
    expect(shop.charge.additionalComponents).toEqual([]);
    expect(shop.units).toEqual([
      expect.objectContaining({ productId: 'product-physical', quantity: 1 }),
    ]);
    expect(shop.estimate).toMatchObject({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 5,
      combinedMinDays: 4,
      combinedMaxDays: 8,
    });
  });

  it('quotes a digital-only shop with no charge, no estimate, and no unavailability', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-digital', productState: ProductState.ACTIVE, isDigital: true },
      ],
      profiles: [],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-digital', inventoryId: 'inv-digital', quantity: 2, 
        },
      ],
    });

    expect(quote.shops).toEqual([]);
    expect(quote.unavailable).toEqual([]);
  });

  it('keeps a physical Product without a ready profile unavailable even next to a digital Product', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-physical', productState: ProductState.ACTIVE },
        { productId: 'product-draft', shippingProfileId: 'profile-draft', productState: ProductState.ACTIVE },
        { productId: 'product-digital', productState: ProductState.ACTIVE, isDigital: true },
      ],
      profiles: [
        buildProfile('profile-draft', {
          status: ShippingProfileStatus.DRAFT,
          rates: [],
        }),
      ],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-physical', inventoryId: 'inv-physical', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-draft', inventoryId: 'inv-draft', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-digital', inventoryId: 'inv-digital', quantity: 1, 
        },
      ],
    });

    expect(quote.shops).toEqual([]);
    expect(quote.unavailable).toEqual([
      {
        productId: 'product-draft',
        inventoryId: 'inv-draft',
        quantity: 1,
        reason: 'profile_not_ready',
        readinessIssues: ['draft', 'missing_rates'],
      },
      {
        productId: 'product-physical',
        inventoryId: 'inv-physical',
        quantity: 1,
        reason: 'missing_assignment',
        readinessIssues: [],
      },
    ]);
  });
});

describe('ShippingQuoteService checkout currency conversion', () => {
  const anchorAt = new Date('2026-09-22T10:15:00.000Z');

  function buildUsdProfileWithFees(oneItemFeeMinor: number, additionalItemFeeMinor: number) {
    return buildProfile('profile-1', {
      shopCurrency: 'USD',
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      rates: [
        {
          id: 'rate-1',
          position: 1,
          destinationScope: ShippingDestinationScope.COUNTRY,
          destinationCountry: 'US',
          oneItemFeeMinor,
          additionalItemFeeMinor,
          deliveryTimeMinDays: 3,
          deliveryTimeMaxDays: 5,
        },
      ],
    });
  }

  it('converts the accepted shipping components from the shop currency into the checkout currency', async () => {
    const { service, fxRateService } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [buildUsdProfileWithFees(900, 250)],
      rates: { 'USD:VND': '25400' },
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'VND',
      units: [
        {
          shopId: 'shop-1', productId: 'product-1', inventoryId: 'inv-1', quantity: 3, 
        },
      ],
    });

    expect(fxRateService.getLatestRate).toHaveBeenCalledWith(
      {
        fromCurrency: 'USD',
        toCurrency: 'VND',
        at: anchorAt,
      },
      expect.any(Map),
    );

    const [shop] = quote.shops;
    expect(shop?.currency).toBe('VND');
    expect(shop?.charge).toMatchObject({
      currency: 'VND',
      quantity: 3,
      baseUnit: { productId: 'product-1', inventoryId: 'inv-1', oneItemFeeMinor: 228600 },
      baseItemFeeMinor: 228600,
      baseItemTotalMinor: 228600,
      additionalItemsQuantity: 2,
      additionalItemFeeMinorTotal: 127000,
      totalMinor: 355600,
    });
    expect(shop?.charge.additionalComponents).toEqual([
      {
        productId: 'product-1',
        inventoryId: 'inv-1',
        quantity: 2,
        additionalItemFeeMinor: 63500,
      },
    ]);
    expect(shop?.units).toEqual([
      expect.objectContaining({
        currency: 'VND',
        oneItemFeeMinor: 228600,
        additionalItemFeeMinor: 63500,
        sourceCurrency: 'USD',
        sourceOneItemFeeMinor: 900,
        sourceAdditionalItemFeeMinor: 250,
        fx: {
          rate: '25400',
          source: 'test-rates',
          effectiveAt: new Date('2026-09-22T00:00:00.000Z'),
          sourceTimestamp: new Date('2026-09-22T00:00:00.000Z'),
        },
      }),
    ]);
  });

  it('keeps same-currency charges exact and never looks up a rate', async () => {
    const { service, fxRateService } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [buildUsdProfileWithFees(900, 250)],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'USD',
      units: [
        {
          shopId: 'shop-1', productId: 'product-1', inventoryId: 'inv-1', quantity: 2, 
        },
      ],
    });

    expect(fxRateService.getLatestRate).not.toHaveBeenCalled();
    const [shop] = quote.shops;
    expect(shop?.charge.totalMinor).toBe(1150);
    expect(shop?.charge.currency).toBe('USD');
    expect(shop?.units).toEqual([
      expect.objectContaining({
        currency: 'USD',
        oneItemFeeMinor: 900,
        additionalItemFeeMinor: 250,
      }),
    ]);
    expect(shop?.units[0]).not.toHaveProperty('sourceCurrency');
    expect(shop?.units[0]).not.toHaveProperty('fx');
  });

  it('converts every unit from its own source currency before choosing the base unit', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-usd', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-eur', shippingProfileId: 'profile-eur', productState: ProductState.ACTIVE },
      ],
      profiles: [
        buildUsdProfileWithFees(500, 100),
        buildProfile('profile-eur', {
          shopCurrency: 'EUR',
          rates: [
            {
              id: 'rate-eur',
              position: 1,
              destinationScope: ShippingDestinationScope.COUNTRY,
              destinationCountry: 'US',
              oneItemFeeMinor: 100,
              additionalItemFeeMinor: 50,
              deliveryTimeMinDays: 3,
              deliveryTimeMaxDays: 5,
            },
          ],
        }),
      ],
      rates: { 'USD:VND': '2', 'EUR:VND': '3' },
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'VND',
      units: [
        {
          shopId: 'shop-1', productId: 'product-usd', inventoryId: 'inv-usd', quantity: 1, 
        },
        {
          shopId: 'shop-1', productId: 'product-eur', inventoryId: 'inv-eur', quantity: 1, 
        },
      ],
    });

    const [shop] = quote.shops;
    // 500 USD cents = 5.00 USD -> 10 VND beats 100 EUR cents = 1.00 EUR -> 3 VND,
    // and the remaining 50 EUR cents = 0.50 EUR -> 1.5 VND rounds to 2 VND.
    expect(shop?.charge).toMatchObject({
      quantity: 2,
      baseUnit: { productId: 'product-usd', inventoryId: 'inv-usd', oneItemFeeMinor: 10 },
      baseItemTotalMinor: 10,
      additionalItemFeeMinorTotal: 2,
      totalMinor: 12,
    });
  });

  it('never falls back when the checkout currency has no exchange rate', async () => {
    const { service } = buildService({
      assignments: [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      profiles: [buildUsdProfileWithFees(900, 250)],
    });

    const quote = await service.quoteForCheckout({
      destination: { countryCode: 'US' },
      anchorAt,
      checkoutCurrency: 'VND',
      units: [
        {
          shopId: 'shop-1', productId: 'product-1', inventoryId: 'inv-1', quantity: 1, 
        },
      ],
    });

    expect(quote.shops).toEqual([]);
    expect(quote.unavailable).toEqual([
      {
        productId: 'product-1',
        inventoryId: 'inv-1',
        quantity: 1,
        reason: 'unsupported_currency',
        readinessIssues: [],
      },
    ]);
  });
});
