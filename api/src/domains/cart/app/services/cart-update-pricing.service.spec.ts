import type { CouponPricingService } from '~/domains/coupon/app/services/coupon-pricing.service';
import type { CartSnapshot } from '../cart.types';
import { CartKind } from '../../domain/enums/cart-kind.enum';
import { CartUpdatePricingService } from './cart-update-pricing.service';

describe('CartUpdatePricingService', () => {
  it('maps buy-now temp cart promo codes to selected shop pricing adjustments', async () => {
    const couponPricingService = {
      buildPricedCartSummary: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<CouponPricingService>;
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
          updatedAt: new Date('2026-05-14T10:00:00.000Z'),
          inventory: {
            inventoryId: 'inventory-1',
            productId: 'product-1',
            productSlug: 'mug',
            shopId: 'shop-1',
            shopName: 'Clay House',
            shopSlug: 'clay-house',
            title: 'Mug',
            variantType: 'none',
            stock: 9,
            currency: 'USD',
            pricing: {
              amountMinor: 1500,
              currency: 'USD',
              sourceCurrency: 'USD',
              sourceUnitAmountMinor: 1500,
            },
            productState: 'active',
          },
        },
      ],
    };

    await new CartUpdatePricingService(couponPricingService).buildPricedCartSummary({
      actor: { type: 'user', userId: 'user-1' },
      cart,
      additionInfoTempCart: {
        promoCodes: [],
      },
    });

    expect(couponPricingService.buildPricedCartSummary).toHaveBeenCalledWith({
      userId: 'user-1',
      cart,
      shopAdjustments: [
        {
          shopId: 'shop-1',
          promoCodes: [],
          note: undefined,
        },
      ],
      validatePromoCodes: true,
    });
  });
});
