import type { CartItemSnapshot } from '../../../cart/app/cart.types';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';
import { CouponAppliesTo } from '../../domain/enums/coupon-applies-to.enum';
import { CouponType } from '../../domain/enums/coupon-type.enum';
import { priceItems } from './auto-sale-item-pricing';

function buildItem(input: {
  amountMinor: number;
  originalAmountMinor?: number;
}): CartItemSnapshot {
  return {
    id: 'cart-item-1',
    quantity: 1,
    isSelectOrder: true,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    inventory: {
      inventoryId: 'inventory-1',
      productId: 'product-1',
      productSlug: 'product-1',
      shopId: 'shop-1',
      shopName: 'Shop 1',
      shopSlug: 'shop-1',
      title: 'Product 1',
      selectedOptions: [],
      stock: 10,
      currency: 'USD',
      pricing: {
        amountMinor: input.amountMinor,
        originalAmountMinor: input.originalAmountMinor,
        currency: 'USD',
        sourceCurrency: 'USD',
        sourceUnitAmountMinor: input.originalAmountMinor ?? input.amountMinor,
      },
    },
  } as never;
}

describe('priceItems', () => {
  it('rounds a percentage reduction exactly as the storefront price does', () => {
    // $10.50 less 5% is 997.5 minor units. Half-up is 998; multiplying major
    // units as a float gives 9.9749999999999996 and rounds down to 997.
    const priced = priceItems(
      [buildItem({ amountMinor: 1050 })],
      [],
      new Map([['product-1', { promotionId: 'promotion-1', percentOff: 5 }]]),
    );

    expect(priced.get('shop-1')?.[0]).toMatchObject({
      unitPriceMinor: 998,
      originalAmountMinor: 1050,
      effectiveUnitPrice: 9.98,
    });
  });

  it('never charges less than the reduction the storefront already applied', () => {
    // The snapshot already carries a 60% storefront reduction: 1500 -> 600.
    const priced = priceItems(
      [buildItem({ amountMinor: 600, originalAmountMinor: 1500 })],
      [],
      new Map([['product-1', { promotionId: 'promotion-1', percentOff: 60 }]]),
    );

    expect(priced.get('shop-1')?.[0]).toMatchObject({
      unitPriceMinor: 600,
      originalAmountMinor: 1500,
    });
  });

  it('leaves the regular price alone when no reduction applies', () => {
    const priced = priceItems([buildItem({ amountMinor: 1050 })], []);

    expect(priced.get('shop-1')?.[0]).toMatchObject({
      unitPriceMinor: 1050,
      originalAmountMinor: 1050,
    });
  });

  it('takes the bigger percentage and never compounds a coupon with a sale', () => {
    const coupon = {
      id: 'coupon-1',
      shop: { id: 'shop-1' },
      isAutoSale: true,
      type: CouponType.PERCENTAGE,
      percentOff: 10,
      appliesTo: CouponAppliesTo.ALL,
      appliesProductIds: [],
      isActive: true,
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
    } as unknown as CouponEntity;

    const priced = priceItems(
      [buildItem({ amountMinor: 1000 })],
      [coupon],
      new Map([['product-1', { promotionId: 'promotion-1', percentOff: 30 }]]),
    );

    // 30% beats 10%; 1000 x 0.3 is 300 off, never 1000 x 0.7 x 0.9.
    expect(priced.get('shop-1')?.[0]).toMatchObject({
      unitPriceMinor: 700,
      originalAmountMinor: 1000,
      autoSaleCoupon: undefined,
    });
  });
});
