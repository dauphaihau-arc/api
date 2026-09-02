import {
  getActiveBasePrice,
  getInventoryPricingSnapshot,
} from './variant-price-read';

describe('variant-price-read', () => {
  function createInventory(prices: Array<{
    marketCode?: string;
    currency: string;
    amountMinor: number;
    activeTo?: Date;
  }>) {
    return {
      prices: {
        getItems: () => prices,
      },
    } as never;
  }

  it('returns the active base price by default', () => {
    const inventory = createInventory([
      {
        currency: 'USD',
        amountMinor: 1200,
      },
      {
        marketCode: 'VN',
        currency: 'VND',
        amountMinor: 320000,
      },
    ]);

    expect(getActiveBasePrice(inventory)?.currency).toBe('USD');
    expect(getInventoryPricingSnapshot(inventory)).toEqual({
      amountMinor: 1200,
      currency: 'USD',
    });
  });

  it('prefers the active market price when the request context matches a market', () => {
    const inventory = createInventory([
      {
        currency: 'USD',
        amountMinor: 1200,
      },
      {
        marketCode: 'VN',
        currency: 'VND',
        amountMinor: 320000,
      },
    ]);

    expect(getInventoryPricingSnapshot(inventory, {
      marketCode: 'VN',
      currency: 'VND',
    })).toEqual({
      amountMinor: 320000,
      currency: 'VND',
    });
  });

  it('falls back to the base price when the market price is unavailable', () => {
    const inventory = createInventory([
      {
        currency: 'USD',
        amountMinor: 1200,
      },
    ]);

    expect(getInventoryPricingSnapshot(inventory, {
      marketCode: 'VN',
      currency: 'VND',
    })).toEqual({
      amountMinor: 1200,
      currency: 'USD',
    });
  });
});
