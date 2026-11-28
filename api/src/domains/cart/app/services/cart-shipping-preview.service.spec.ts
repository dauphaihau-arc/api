import { CartKind } from '../../domain/enums/cart-kind.enum';
import type { CartSnapshot } from '../cart.types';
import { CartShippingPreviewService } from './cart-shipping-preview.service';

function buildCart(): CartSnapshot {
  const inventory = {
    inventoryId: 'inventory-1',
    productId: 'product-1',
    productPublicId: 'prod_1',
    productSlug: 'mug',
    shopId: 'shop-1',
    shopPublicId: 'shop_1',
    shopName: 'Clay House',
    shopSlug: 'clay-house',
    title: 'Mug',
    stock: 4,
    currency: 'USD',
    pricing: {
      amountMinor: 1000,
      currency: 'USD',
      sourceCurrency: 'USD',
      sourceUnitAmountMinor: 1000,
    },
    productState: 'active',
  };

  return {
    id: 'cart-1',
    userId: 'user-1',
    guestSessionId: null,
    kind: CartKind.ACTIVE,
    items: [{
      id: 'item-1',
      quantity: 2,
      isSelectOrder: true,
      updatedAt: new Date('2026-09-22T10:00:00.000Z'),
      inventory,
    }],
  };
}

describe('CartShippingPreviewService', () => {
  it('attaches preview availability and reason without changing selection', async () => {
    const marketContextService = {
      resolveCurrentRequest: jest.fn().mockResolvedValue({
        previewCountryCode: 'VN',
        currency: 'USD',
      }),
    };
    const shippingQuoteService = {
      resolveForProducts: jest.fn().mockResolvedValue([{
        productId: 'product-1',
        available: false,
        isDigital: false,
        reason: 'unsupported_destination',
      }]),
    };
    const service = new CartShippingPreviewService(
      marketContextService as never,
      shippingQuoteService as never,
    );

    const cart = await service.attach(buildCart());

    expect(cart?.items[0]).toMatchObject({
      quantity: 2,
      isSelectOrder: true,
      shipping: {
        available: false,
        isDigital: false,
        reason: 'unsupported_destination',
      },
    });
    expect(cart?.items[0]?.inventory).toEqual(buildCart().items[0]?.inventory);
    expect(shippingQuoteService.resolveForProducts).toHaveBeenCalledWith({
      productIds: ['product-1'],
      destination: { countryCode: 'VN' },
    });
  });

  it('leaves the cart alone when the request has no Market context', async () => {
    const cart = buildCart();
    const service = new CartShippingPreviewService(
      { resolveCurrentRequest: jest.fn().mockResolvedValue(undefined) } as never,
      { resolveForProducts: jest.fn() } as never,
    );

    await expect(service.attach(cart)).resolves.toBe(cart);
  });
});
