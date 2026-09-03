import type { EntityManager } from '@mikro-orm/postgresql';
import { CartKind } from '../../../cart/domain/enums/cart-kind.enum';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import {
  CouponCodeNotApplicableError,
  CouponCodeNotFoundError,
  CouponPricingService,
} from './coupon-pricing.service';

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

    return {
      couponRepository,
      service: new CouponPricingService(entityManager),
    };
  }

  it('uses resolved cart pricing as the authoritative checkout amount when present', async () => {
    const { service } = buildService();
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

    const priced = await service.buildPricedCartSummary({ cart });
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

  it('rejects requested promo codes that are not found for the selected shop', async () => {
    const { service } = buildService();
    const cart: CartSnapshot = {
      id: 'cart-1',
      userId: 'user-1',
      guestSessionId: null,
      kind: CartKind.BUY_NOW,
      items: [
        {
          id: 'item-1',
          quantity: 1,
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
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 1300,
            },
            productState: 'active',
          },
        },
      ],
    };

    await expect(service.buildPricedCartSummary({
      cart,
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['MISSING'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotFoundError);
  });

  it('rejects requested promo codes that do not meet cart rules', async () => {
    const { service, couponRepository } = buildService();
    const cart: CartSnapshot = {
      id: 'cart-1',
      userId: 'user-1',
      guestSessionId: null,
      kind: CartKind.BUY_NOW,
      items: [
        {
          id: 'item-1',
          quantity: 1,
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
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 1300,
            },
            productState: 'active',
          },
        },
      ],
    };
    couponRepository.find.mockResolvedValue([
      {
        id: 'coupon-1',
        code: 'SAVE10',
        shop: { id: 'shop-1' },
        isActive: true,
        isAutoSale: false,
        startDate: new Date('2026-05-01T00:00:00.000Z'),
        endDate: new Date('2026-06-01T00:00:00.000Z'),
        maxUses: 100,
        maxUsesPerUser: 100,
        usesCount: 0,
        appliesTo: 'all',
        appliesProductIds: [],
        minOrderType: 'order_total',
        minOrderValue: 120,
        minProducts: 0,
        type: 'percentage',
        percentOff: 10,
        amountOff: 0,
      },
    ]);

    await expect(service.buildPricedCartSummary({
      cart,
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotApplicableError);
  });
});
