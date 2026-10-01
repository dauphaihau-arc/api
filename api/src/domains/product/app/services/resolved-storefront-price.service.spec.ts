import type { CouponAutoSaleProjectionReader } from '~/domains/coupon/app/ports/coupon-auto-sale-projection.reader';
import type { SaleProjectionReader } from '~/domains/promotion/app/ports/sale-projection.reader';
import { ResolvedStorefrontPriceService } from './resolved-storefront-price.service';

function buildInventory(input: {
  amountMinor: number;
  currency?: string;
}) {
  return {
    id: 'inventory-1',
    shop: { id: 'shop-1' },
    product: { id: 'product-1' },
    prices: {
      getItems: () => [{
        id: 'price-1',
        currency: input.currency ?? 'USD',
        amountMinor: input.amountMinor,
      }],
    },
  } as never;
}

describe('ResolvedStorefrontPriceService', () => {
  function buildService(input?: {
    autoSale?: { couponId: string; percentOff: number };
    sale?: { promotionId: string; percentOff: number };
  }) {
    const couponAutoSaleProjectionReader = {
      findBestAutoSaleForProduct: jest.fn().mockResolvedValue(input?.autoSale),
    } as unknown as CouponAutoSaleProjectionReader;
    const saleProjectionReader = {
      findBestSalesForProducts: jest.fn().mockResolvedValue(
        input?.sale
          ? new Map([['product-1', input.sale]])
          : new Map(),
      ),
    } as unknown as SaleProjectionReader;

    return new ResolvedStorefrontPriceService(
      { indexedPricePairs: [{ marketCode: 'US', currency: 'USD' }], rarePriceCacheTtlMs: 300_000 } as never,
      { get: jest.fn(), set: jest.fn() } as never,
      { resolveCurrentRequest: jest.fn() } as never,
      {} as never,
      couponAutoSaleProjectionReader,
      saleProjectionReader,
    );
  }

  it('reduces the regular price by the winning Sale and exposes it as compare-at', async () => {
    const service = buildService({ sale: { promotionId: 'promotion-1', percentOff: 60 } });

    const price = await service.resolve(buildInventory({ amountMinor: 1500 }));

    expect(price).toMatchObject({
      amountMinor: 600,
      originalAmountMinor: 1500,
      currency: 'USD',
    });
  });

  it('never compounds a Sale and an automatic-sale Coupon, and the bigger percentage wins', async () => {
    const saleWins = buildService({
      autoSale: { couponId: 'coupon-1', percentOff: 10 },
      sale: { promotionId: 'promotion-1', percentOff: 60 },
    });
    const couponWins = buildService({
      autoSale: { couponId: 'coupon-1', percentOff: 70 },
      sale: { promotionId: 'promotion-1', percentOff: 60 },
    });

    expect(await saleWins.resolve(buildInventory({ amountMinor: 1500 })))
      .toMatchObject({ amountMinor: 600, originalAmountMinor: 1500 });
    expect(await couponWins.resolve(buildInventory({ amountMinor: 1500 })))
      .toMatchObject({ amountMinor: 450, originalAmountMinor: 1500 });
  });

  it('rounds the reduced price with the shared money precision', async () => {
    const service = buildService({ sale: { promotionId: 'promotion-1', percentOff: 33 } });

    const price = await service.resolve(buildInventory({ amountMinor: 999 }));

    expect(price).toMatchObject({ amountMinor: 669, originalAmountMinor: 999 });
  });

  it('leaves the price alone, and advertises no compare-at, when no reduction applies', async () => {
    const service = buildService();

    const price = await service.resolve(buildInventory({ amountMinor: 1500 }));

    expect(price).toMatchObject({ amountMinor: 1500 });
    expect(price?.originalAmountMinor).toBeUndefined();
  });

  it('advertises no compare-at when a percentage reduces nothing', async () => {
    const service = buildService({ sale: { promotionId: 'promotion-1', percentOff: 0 } });

    const price = await service.resolve(buildInventory({ amountMinor: 1500 }));

    expect(price).toMatchObject({ amountMinor: 1500 });
    expect(price?.originalAmountMinor).toBeUndefined();
  });
});
