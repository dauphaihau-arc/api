import { CartKind } from '../../domain/enums/cart-kind.enum';
import type { CartSnapshot } from '../cart.types';
import { CheckoutShippingUnavailableError } from '../../../order/app/errors/order-app.error';
import type { PromotionPricingService } from '../../../promotion/app/services/promotion-pricing.service';
import { CartPricingService } from './cart-pricing.service';

const cart: CartSnapshot = {
  id: 'cart-1',
  userId: 'user-1',
  guestSessionId: null,
  kind: CartKind.ACTIVE,
  items: [{
    id: 'item-1',
    quantity: 1,
    isSelectOrder: true,
    updatedAt: new Date('2026-09-22T10:00:00.000Z'),
    inventory: {
      inventoryId: 'inventory-1',
      productId: 'product-1',
      productSlug: 'mug',
      shopId: 'shop-1',
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
    },
  }],
};

function buildPromotionPricingService(overrides?: {
  applyToCart?: jest.Mocked<PromotionPricingService>['applyToCart'];
}): jest.Mocked<PromotionPricingService> {
  return {
    applyToCart: overrides?.applyToCart ?? jest.fn().mockResolvedValue([]),
    listDiscoverablePromoCodes: jest.fn(),
    addPromoCode: jest.fn(),
  } as unknown as jest.Mocked<PromotionPricingService>;
}

describe('CartPricingService', () => {
  it('adds the destination-specific shipping quote to the cart total', async () => {
    const shippingQuote = {
      anchorAt: new Date('2026-09-22T10:00:00.000Z'),
      unavailable: [],
      shops: [{
        shopId: 'shop-1',
        charge: { currency: 'USD', totalMinor: 500 },
      }],
    };
    const shippingQuoteService = {
      quoteForCheckout: jest.fn().mockResolvedValue(shippingQuote),
      listOriginCountries: jest.fn().mockResolvedValue(['US']),
    };
    const promotionPricingService = buildPromotionPricingService({
      applyToCart: jest.fn().mockResolvedValue([{
        shopId: 'shop-1',
        items: cart.items.map((item) => ({
          ...item,
          unitPriceMinor: item.inventory.pricing.amountMinor,
          originalAmountMinor: item.inventory.pricing.amountMinor,
          price: 10,
          baseUnitPrice: 10,
          effectiveUnitPrice: 10,
          promoDiscountMinor: 0,
        })),
        subtotal: 10,
        totalDiscount: 0,
        saleDiscount: 0,
        promoOffers: [],
        shippingDiscountMinor: 0,
        shippingDiscounts: [],
      }]),
    });
    const service = new CartPricingService(
      promotionPricingService,
      shippingQuoteService as never,
    );

    const priced = await service.buildPricedCartSummary({
      cart,
      shippingAddress: {
        fullName: 'Jane Doe',
        address1: '123 Main',
        city: 'Austin',
        country: 'US',
        state: 'TX',
        zip: '73301',
        phone: '0123',
      },
    });

    expect(priced.shops[0]?.totalShippingFee).toBe(5);
    expect(priced.totalPrice).toBe(15);
    expect(priced.shippingAnchorAt).toEqual(shippingQuote.anchorAt);
  });

  it('waives quoted shipping with an eligible free-shipping code', async () => {
    const shippingQuoteService = {
      quoteForCheckout: jest.fn().mockResolvedValue({
        anchorAt: new Date('2026-09-22T10:00:00.000Z'),
        unavailable: [],
        shops: [{ shopId: 'shop-1', charge: { currency: 'USD', totalMinor: 500 } }],
      }),
      listOriginCountries: jest.fn().mockResolvedValue(['US']),
    };
    const promotionPricingService = buildPromotionPricingService({
      applyToCart: jest.fn().mockResolvedValue([{
        shopId: 'shop-1',
        items: cart.items.map((item) => ({
          ...item,
          unitPriceMinor: item.inventory.pricing.amountMinor,
          originalAmountMinor: item.inventory.pricing.amountMinor,
          price: 10,
          baseUnitPrice: 10,
          effectiveUnitPrice: 10,
          promoDiscountMinor: 0,
        })),
        subtotal: 10,
        totalDiscount: 0,
        saleDiscount: 0,
        promoOffers: [{
          id: 'promo-1',
          shopId: 'shop-1',
          code: 'FREESHIP',
          type: 'free_shipping',
          currency: 'USD',
          percentOff: 0,
          amountOff: 0,
          scope: 'all',
          productIds: [],
          startAt: new Date('2026-01-01T00:00:00.000Z'),
          endAt: new Date('2027-01-01T00:00:00.000Z'),
          isActive: true,
          minOrderType: 'none',
          minOrderValue: 0,
          minPurchaseQuantity: 0,
          maxUses: null,
          maxUsesPerUser: null,
          usesCount: 0,
        }],
        shippingDiscountMinor: 500,
        shippingDiscounts: [{
          promotionId: 'promo-1',
          code: 'FREESHIP',
          type: 'free_shipping',
          appliesTo: 'all',
          appliesProductIds: [],
          minOrderType: 'none',
          minOrderValue: 0,
          minProducts: 0,
          maxUses: 0,
          maxUsesPerUser: 0,
          usesCount: 0,
          waivedMinor: 500,
          currency: 'USD',
        }],
      }]),
    });
    const service = new CartPricingService(
      promotionPricingService,
      shippingQuoteService as never,
    );

    const priced = await service.buildPricedCartSummary({
      cart,
      shippingAddress: {
        fullName: 'Jane Doe',
        address1: '123 Main',
        city: 'Austin',
        country: 'US',
        state: 'TX',
        zip: '73301',
        phone: '0123',
      },
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['FREESHIP'] }],
    });

    expect(priced.shops[0]?.totalShippingFee).toBe(0);
    expect(priced.shops[0]?.totalDiscount).toBe(0);
    expect(priced.shops[0]?.shippingDiscountMinor).toBe(500);
    expect(priced.totalPrice).toBe(10);
  });

  it('rejects pricing when the destination cannot be served', async () => {
    const shippingQuoteService = {
      quoteForCheckout: jest.fn().mockResolvedValue({
        anchorAt: new Date('2026-09-22T10:00:00.000Z'),
        unavailable: [{ productId: 'product-1', inventoryId: 'inventory-1', quantity: 1 }],
        shops: [],
      }),
      listOriginCountries: jest.fn(),
    };
    const service = new CartPricingService(
      buildPromotionPricingService(),
      shippingQuoteService as never,
    );

    await expect(service.buildPricedCartSummary({
      cart,
      shippingAddress: {
        fullName: 'Jane Doe',
        address1: '123 Main',
        city: 'Berlin',
        country: 'DE',
        state: 'BE',
        zip: '10115',
        phone: '0123',
      },
    })).rejects.toBeInstanceOf(CheckoutShippingUnavailableError);
  });
});
