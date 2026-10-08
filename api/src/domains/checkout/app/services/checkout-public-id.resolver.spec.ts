import { NotFoundException } from '@nestjs/common';
import { CheckoutPublicIdResolver } from './checkout-public-id.resolver';

describe('CheckoutPublicIdResolver', () => {
  const shopAccessService = { resolveShopPublicIds: jest.fn() };
  const orderPublicIdLookup = {
    resolveOrderPublicId: jest.fn(),
    resolveOrderPublicIds: jest.fn(),
  };

  function buildResolver() {
    return new CheckoutPublicIdResolver(orderPublicIdLookup as never, shopAccessService as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('throws a 404 for an unknown shop public id', async () => {
    shopAccessService.resolveShopPublicIds.mockResolvedValue([null]);
    await expect(buildResolver().resolveShopId('shop_unknown')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves order arrays in input order using the batch result', async () => {
    orderPublicIdLookup.resolveOrderPublicIds.mockResolvedValue(new Map([
      ['ord_public_1', 'order-1'], ['ord_public_2', 'order-2'],
    ]));
    await expect(buildResolver().resolveOrderIds(['ord_public_2', 'ord_public_1'])).resolves.toEqual(['order-2', 'order-1']);
    expect(orderPublicIdLookup.resolveOrderPublicIds).toHaveBeenCalledWith(['ord_public_2', 'ord_public_1']);
  });

  it('resolves quote adjustments in one batch without dropping other request data', async () => {
    shopAccessService.resolveShopPublicIds.mockResolvedValue(['shop-internal-1', 'shop-internal-2']);
    const body = { currency: 'USD', shopAdjustments: [{ shopId: 'shop_public_1', note: 'gift' }, { shopId: 'shop_public_2', note: 'fragile' }] };
    await expect(buildResolver().resolveCheckoutQuoteShopIds(body)).resolves.toEqual({
      currency: 'USD', shopAdjustments: [{ shopId: 'shop-internal-1', note: 'gift' }, { shopId: 'shop-internal-2', note: 'fragile' }],
    });
    expect(shopAccessService.resolveShopPublicIds).toHaveBeenCalledTimes(1);
    expect(body.shopAdjustments[0].shopId).toBe('shop_public_1');
  });

  it('preserves requests with no adjustments', async () => {
    const body = { shopAdjustments: [] };
    await expect(buildResolver().resolveCheckoutQuoteShopIds(body)).resolves.toBe(body);
    expect(shopAccessService.resolveShopPublicIds).not.toHaveBeenCalled();
  });
});
