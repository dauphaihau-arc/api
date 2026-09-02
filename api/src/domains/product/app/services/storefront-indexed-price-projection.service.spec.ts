import type { CouponAutoSaleProjectionReader } from '~/domains/coupon/app/ports/coupon-auto-sale-projection.reader';
import type { FxRateService } from '~/integrations/currency/fx-rate.service';
import type { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
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
    autoSale?: { couponId: string; percentOff: number };
  }) {
    const couponAutoSaleProjectionReader: Pick<jest.Mocked<CouponAutoSaleProjectionReader>, 'findBestAutoSaleForProduct'> = {
      findBestAutoSaleForProduct: jest.fn().mockResolvedValue(input?.autoSale),
    };
    const fxRateService: Pick<jest.Mocked<FxRateService>, 'getLatestRate'> = {
      getLatestRate: jest.fn(),
    };
    const roundingPolicyService: Pick<jest.Mocked<RoundingPolicyService>, 'toMinorUnits'> = {
      toMinorUnits: jest.fn((amount: number, _currency: string) => Math.round(amount * 100)),
    };

    return {
      service: new StorefrontIndexedPriceProjectionService(
        {
          indexedPricePairs: input?.indexedPricePairs ?? [{ marketCode: 'US', currency: 'USD' }],
          rarePriceCacheTtlMs: 300_000,
        },
        fxRateService as never,
        roundingPolicyService as never,
        couponAutoSaleProjectionReader as never,
      ),
      couponAutoSaleProjectionReader,
    };
  }

  it('projects active auto-sale coupon pricing into base product summaries', async () => {
    const { service, couponAutoSaleProjectionReader } = buildService({
      autoSale: { couponId: 'coupon-1', percentOff: 18 },
    });

    const result = await service.projectProduct(buildProduct([
      {
        currency: 'USD',
        amountMinor: 10_000,
      },
    ]));

    expect(couponAutoSaleProjectionReader.findBestAutoSaleForProduct).toHaveBeenCalledWith({
      shopId: 'shop-1',
      productId: 'product-1',
    });
    expect(result.baseSummary).toEqual({
      currency: 'USD',
      minAmountMinor: 8200,
      maxAmountMinor: 8200,
      originalMinAmountMinor: 10_000,
      originalMaxAmountMinor: 10_000,
      autoSale: {
        couponId: 'coupon-1',
        percentOff: 18,
      },
    });
    expect(result.inventoryPricingById.get('inventory-1')?.basePrice).toEqual({
      amountMinor: 8200,
      originalAmountMinor: 10_000,
      currency: 'USD',
      autoSale: {
        couponId: 'coupon-1',
        percentOff: 18,
      },
    });
  });

  it('omits compare-at pricing when no auto-sale applies', async () => {
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

  it('projects active auto-sale coupon pricing into indexed market summaries', async () => {
    const { service } = buildService({
      indexedPricePairs: [{ marketCode: 'VN', currency: 'VND' }],
      autoSale: { couponId: 'coupon-1', percentOff: 18 },
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
        couponId: 'coupon-1',
        percentOff: 18,
      },
    });
  });
});
