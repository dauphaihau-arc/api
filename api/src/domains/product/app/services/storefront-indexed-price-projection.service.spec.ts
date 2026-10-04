import type { FxRateService } from '~/integrations/currency/fx-rate.service';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import type { SaleProjectionReader } from '~/domains/promotion/app/ports/sale-projection.reader';
import { StorefrontIndexedPriceProjectionService } from './storefront-indexed-price-projection.service';

function buildProduct(prices: Array<{
  id?: string;
  marketCode?: string;
  currency: string;
  amountMinor: number;
  activeTo?: Date;
}>) {
  return {
    id: 'product-1',
    shop: { id: 'shop-1' },
    inventoryRecords: {
      getItems: () => [
        {
          id: 'inventory-1',
          prices: {
            getItems: () => prices,
          },
        },
      ],
    },
  } as never;
}

describe('StorefrontIndexedPriceProjectionService', () => {
  function buildService(input?: {
    indexedPricePairs?: Array<{ marketCode: string; currency: string }>;
    sale?: { promotionId: string; percentOff: number };
  }) {
    const saleProjectionReader = {
      findBestSalesForProducts: jest.fn().mockResolvedValue(
        input?.sale
          ? new Map([['product-1', input.sale]])
          : new Map(),
      ),
    } as unknown as SaleProjectionReader;
    const fxRateService: Pick<jest.Mocked<FxRateService>, 'getLatestRate'> = {
      getLatestRate: jest.fn(),
    };
    const roundingPolicyService = new RoundingPolicyService();

    return {
      service: new StorefrontIndexedPriceProjectionService(
        {
          indexedPricePairs: input?.indexedPricePairs ?? [{ marketCode: 'US', currency: 'USD' }],
          rarePriceCacheTtlMs: 300_000,
        },
        new MoneyConversionService(fxRateService as never, roundingPolicyService),
        saleProjectionReader as never,
      ),
      saleProjectionReader,
    };
  }

  it('projects active Sale pricing into base product summaries', async () => {
    const { service, saleProjectionReader } = buildService({
      sale: { promotionId: 'promotion-1', percentOff: 18 },
    });

    const result = await service.projectProduct(buildProduct([
      {
        currency: 'USD',
        amountMinor: 10_000,
      },
    ]));

    expect(saleProjectionReader.findBestSalesForProducts).toHaveBeenCalledWith({
      targets: [{ shopId: 'shop-1', productId: 'product-1' }],
    });
    expect(result.baseSummary).toEqual({
      currency: 'USD',
      minAmountMinor: 8200,
      maxAmountMinor: 8200,
      originalMinAmountMinor: 10_000,
      originalMaxAmountMinor: 10_000,
      autoSale: {
        promotionId: 'promotion-1',
        percentOff: 18,
      },
    });
    expect(result.inventoryPricingById.get('inventory-1')?.basePrice).toEqual({
      amountMinor: 8200,
      originalAmountMinor: 10_000,
      currency: 'USD',
      autoSale: {
        promotionId: 'promotion-1',
        percentOff: 18,
      },
    });
  });

  it('discounts every purchasable inventory item of a selected product', async () => {
    const { service } = buildService({
      sale: { promotionId: 'promotion-1', percentOff: 50 },
    });

    const result = await service.projectProduct({
      id: 'product-1',
      shop: { id: 'shop-1' },
      inventoryRecords: {
        getItems: () => [
          { id: 'inventory-1', prices: { getItems: () => [{ currency: 'USD', amountMinor: 2000 }] } },
          { id: 'inventory-2', prices: { getItems: () => [{ currency: 'USD', amountMinor: 3000 }] } },
        ],
      },
    } as never);

    expect(result.inventoryPricingById.get('inventory-1')?.basePrice).toEqual({
      amountMinor: 1000,
      originalAmountMinor: 2000,
      currency: 'USD',
      autoSale: { promotionId: 'promotion-1', percentOff: 50 },
    });
    expect(result.inventoryPricingById.get('inventory-2')?.basePrice).toEqual({
      amountMinor: 1500,
      originalAmountMinor: 3000,
      currency: 'USD',
      autoSale: { promotionId: 'promotion-1', percentOff: 50 },
    });
  });

  it('omits compare-at pricing when no Sale applies', async () => {
    const { service } = buildService();

    const result = await service.projectProduct(buildProduct([
      {
        currency: 'USD',
        amountMinor: 10_000,
      },
    ]));

    expect(result.baseSummary).toEqual({
      currency: 'USD',
      minAmountMinor: 10_000,
      maxAmountMinor: 10_000,
    });
    expect(result.inventoryPricingById.get('inventory-1')?.basePrice).toEqual({
      amountMinor: 10_000,
      currency: 'USD',
    });
  });

  it('projects active Sale pricing into indexed market summaries', async () => {
    const { service } = buildService({
      indexedPricePairs: [{ marketCode: 'VN', currency: 'VND' }],
      sale: { promotionId: 'promotion-1', percentOff: 18 },
    });

    const result = await service.projectProduct(buildProduct([
      {
        currency: 'USD',
        amountMinor: 10_000,
      },
      {
        marketCode: 'VN',
        currency: 'VND',
        amountMinor: 250_000,
      },
    ]));

    expect(result.summaryByMarket?.VN?.VND).toEqual({
      currency: 'VND',
      minAmountMinor: 205_000,
      maxAmountMinor: 205_000,
      originalMinAmountMinor: 250_000,
      originalMaxAmountMinor: 250_000,
      autoSale: {
        promotionId: 'promotion-1',
        percentOff: 18,
      },
    });
  });
});
