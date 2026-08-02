import type { EntityManager } from '@mikro-orm/postgresql';
import { CartKind } from '../../../cart/domain/enums/cart-kind.enum';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import { CouponPricingService } from './coupon-pricing.service';

describe('CouponPricingService', () => {
  function buildService() {
    const couponRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const usageRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const shippingRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const entityManager = {
      fork: jest.fn().mockReturnValue({
        getRepository: jest.fn((entity: { name?: string }) => {
          switch (entity?.name) {
            case 'CouponEntity':
              return couponRepository;
            case 'CouponUsageEntity':
              return usageRepository;
            case 'ProductShippingProfileEntity':
              return shippingRepository;
            default:
              throw new Error(`Unexpected repository: ${entity?.name}`);
          }
        }),
      }),
    } as unknown as EntityManager;

    return new CouponPricingService(entityManager);
  }

  it('uses resolved cart pricing as the authoritative checkout amount when present', async () => {
    const service = buildService();
    const cart: CartSnapshot = {
      id: 'cart-1',
      userId: 'user-1',
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [
        {
          id: 'item-1',
          quantity: 2,
          isSelectOrder: true,
          updatedAt: new Date('2026-05-20T08:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-1',
            productId: 'product-1',
            productSlug: 'mug',
            shopId: 'shop-1',
            shopName: 'Clay House',
            shopSlug: 'clay-house',
            title: 'Mug',
            variantType: 'single',
            stock: 4,
            currency: 'USD',
            pricing: {
              amountMinor: 1300,
              originalAmountMinor: 1700,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 1300,
              sourceType: 'base_fx',
              sourcePriceId: 'price-1',
            },
            productState: 'active',
          },
        },
      ],
    };

    const priced = await service.priceCart({ cart });
    const item = priced.shops[0]?.items[0];

    expect(item?.currency).toBe('USD');
    expect(item?.unitPriceMinor).toBe(1300);
    expect(item?.originalAmountMinor).toBe(1700);
    expect(item?.price).toBe(17);
    expect(item?.salePrice).toBe(13);
    expect(item?.effectiveUnitPrice).toBe(13);
    expect(priced.subtotalPrice).toBe(26);
    expect(priced.totalPrice).toBe(26);
  });
});
