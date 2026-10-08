import { CartController } from './cart.controller';
import type { GuestCartSessionService } from './guest-cart-session.service';
import type { CartUpdatePricingService } from '../../app/services/cart-update-pricing.service';
import type { CartPublicShopResolver } from '../../app/services/cart-public-shop-resolver.service';
import type { CartSnapshot } from '../../app/cart.types';
import type { AddCartItemUseCase } from '../../app/use-cases/add-cart-item/add-cart-item.use-case';
import type { ApplyPromoCodeUseCase } from '../../app/use-cases/apply-promo-code/apply-promo-code.use-case';
import type { GetCartUseCase } from '../../app/use-cases/get-cart/get-cart.use-case';
import type { ListDiscoverablePromoCodesUseCase } from '../../app/use-cases/list-discoverable-promo-codes/list-discoverable-promo-codes.use-case';
import type { MergeGuestCartUseCase } from '../../app/use-cases/merge-guest-cart/merge-guest-cart.use-case';
import type { RemoveCartItemUseCase } from '../../app/use-cases/remove-cart-item/remove-cart-item.use-case';
import type { UpdateCartItemUseCase } from '../../app/use-cases/update-cart-item/update-cart-item.use-case';
import { CartKind } from '../../domain/enums/cart-kind.enum';

describe('CartController', () => {
  function buildController() {
    const checkoutConfig = {
      maxOrderTotalByCurrencyMinor: {
        USD: 99999999,
      },
    };
    const cartUpdatePricingService = {
      buildPricedCartSummary: jest.fn(),
    } as unknown as jest.Mocked<CartUpdatePricingService>;
    const guestCartSessionService = {
      extractSessionId: jest.fn(),
      ensureSessionId: jest.fn(),
      clearSession: jest.fn(),
    } as unknown as jest.Mocked<GuestCartSessionService>;
    const cartPublicShopResolver = {
      resolveShopId: jest.fn().mockImplementation(async (publicId: string) => publicId.replace('shop_', 'shop-')),
      resolveShopAdjustments: jest.fn().mockImplementation(async (adjustments: Array<{ shopId: string; note?: string }>) => adjustments.map((entry) => ({ ...entry, shopId: entry.shopId.replace('shop_', 'shop-') }))),
    };
    const getCartUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetCartUseCase>;
    const mergeGuestCartUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<MergeGuestCartUseCase>;
    const addCartItemUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AddCartItemUseCase>;
    const updateCartItemUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateCartItemUseCase>;
    const removeCartItemUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RemoveCartItemUseCase>;
    const listDiscoverablePromoCodesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListDiscoverablePromoCodesUseCase>;
    const applyPromoCodeUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ApplyPromoCodeUseCase>;

    const controller = new CartController(
      checkoutConfig as never,
      cartUpdatePricingService,
      guestCartSessionService,
      cartPublicShopResolver as unknown as CartPublicShopResolver,
      getCartUseCase,
      mergeGuestCartUseCase,
      addCartItemUseCase,
      updateCartItemUseCase,
      removeCartItemUseCase,
      listDiscoverablePromoCodesUseCase,
      applyPromoCodeUseCase,
    );

    return {
      controller,
      cartUpdatePricingService,
      guestCartSessionService,
      cartPublicShopResolver,
      addCartItemUseCase,
      getCartUseCase,
      mergeGuestCartUseCase,
      listDiscoverablePromoCodesUseCase,
      applyPromoCodeUseCase,
    };
  }

  it('returns an empty guest cart when no auth user or guest cookie exists', async () => {
    const { controller, guestCartSessionService } = buildController();
    guestCartSessionService.extractSessionId.mockReturnValue(null);

    const response = await controller.cart({} as never, {} as never);

    expect(response).toEqual({
      cart: null,
      cart_owner_type: 'guest',
      requires_sign_in_for_checkout: false,
      checkout_policy: {
        max_order_total_minor: 99999999,
      },
      summary: {
        currency: 'USD',
        subtotal_minor: 0,
        discount_minor: 0,
        subtotal_after_discount_minor: 0,
        shipping_minor: 0,
        total_minor: 0,
        total_selected_quantity: 0,
        total_quantity: 0,
      },
    });
  });

  it('creates or reuses a guest session for guest add-to-cart writes', async () => {
    const { controller, guestCartSessionService, addCartItemUseCase } = buildController();
    guestCartSessionService.ensureSessionId.mockReturnValue('guest-session-1');
    addCartItemUseCase.execute.mockResolvedValue({
      isOk: true,
      value: {
        id: 'cart-1',
        userId: null,
        guestSessionId: 'guest-session-1',
        kind: CartKind.ACTIVE,
        items: [],
      },
    } as never);

    await controller.addItem(
      {} as never,
      {} as never,
      {
        inventoryId: 'inventory-1',
        quantity: 2,
      } as never,
    );

    expect(addCartItemUseCase.execute).toHaveBeenCalledWith(
      { type: 'guest', guestSessionId: 'guest-session-1' },
      {
        inventoryId: 'inventory-1',
        quantity: 2,
        isTemp: undefined,
      },
    );
  });

  it('merges guest cart into the authenticated user cart and clears the guest session cookie', async () => {
    const {
      controller,
      guestCartSessionService,
      mergeGuestCartUseCase,
    } = buildController();
    guestCartSessionService.extractSessionId.mockReturnValue('guest-session-1');
    mergeGuestCartUseCase.execute.mockResolvedValue({
      id: 'cart-1',
      userId: 'user-1',
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [],
    });

    const response = { clearCookie: jest.fn() } as never;

    const result = await controller.merge(
      { user: { userId: 'user-1' } } as never,
      response,
    );

    expect(mergeGuestCartUseCase.execute).toHaveBeenCalledWith('guest-session-1', 'user-1');
    expect(guestCartSessionService.clearSession).toHaveBeenCalledWith(response);
    expect(result.cart_owner_type).toBe('user');
    expect(result.requires_sign_in_for_checkout).toBe(false);
  });

  it('prices buy-now Promo Code updates from temp cart promo codes', async () => {
    const { controller, getCartUseCase, cartUpdatePricingService } = buildController();
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
            productPublicId: 'prod_1',
            productSlug: 'mug',
            shopId: 'shop-1',
            shopPublicId: 'shop_1',
            shopName: 'Clay House',
            shopSlug: 'clay-house',
            title: 'Mug',
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
    getCartUseCase.execute.mockResolvedValue(cart);
    cartUpdatePricingService.buildPricedCartSummary.mockResolvedValue({
      cart,
      shops: [],
      currency: 'USD',
      subtotalPrice: 15,
      totalDiscount: 0,
      saleDiscount: 0,
      subtotalAfterDiscount: 15,
      totalShippingFee: 0,
      totalPrice: 15,
      totalSelectedQuantity: 1,
      totalQuantity: 1,
    });

    await controller.updateItem(
      { user: { userId: 'user-1' } } as never,
      {} as never,
      {
        cartId: 'cart-1',
        additionInfoTempCart: {
          promo_codes: [],
        },
      } as never,
    );

    expect(cartUpdatePricingService.buildPricedCartSummary).toHaveBeenCalledWith({
      actor: { type: 'user', userId: 'user-1' },
      cart,
      additionInfoTempCart: {
        promoCodes: [],
        note: undefined,
      },
      additionInfoShopCarts: undefined,
    });
  });

  it('returns an empty promo code list when no auth user or guest cookie exists', async () => {
    const { controller, guestCartSessionService } = buildController();
    guestCartSessionService.extractSessionId.mockReturnValue(null);

    const response = await controller.promoCodes(
      {} as never,
      { shopId: 'shop_1' } as never,
    );

    expect(response).toEqual({ promo_codes: [] });
  });

  it('maps discoverable promo codes to the shopper wire shape with eligibility flags', async () => {
    const { controller, guestCartSessionService, listDiscoverablePromoCodesUseCase } = buildController();
    guestCartSessionService.extractSessionId.mockReturnValue('guest-session-1');
    listDiscoverablePromoCodesUseCase.execute.mockResolvedValue([{
      code: 'SAVE10',
      benefitType: 'percentage' as never,
      productScope: 'all' as never,
      amountOff: 0,
      percentOff: 10,
      minOrderType: 'none' as never,
      minOrderValue: 0,
      minPurchaseQuantity: 0,
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      currency: 'USD',
      isEligible: true,
      ineligibleReason: null,
    }, {
      code: 'MUGONLY',
      benefitType: 'percentage' as never,
      productScope: 'specific' as never,
      amountOff: 0,
      percentOff: 5,
      minOrderType: 'none' as never,
      minOrderValue: 0,
      minPurchaseQuantity: 0,
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      currency: 'USD',
      isEligible: false,
      ineligibleReason: 'product_scope' as never,
    }]);

    const response = await controller.promoCodes(
      {} as never,
      { shopId: 'shop_1' } as never,
    );

    expect(listDiscoverablePromoCodesUseCase.execute).toHaveBeenCalledWith({
      actor: { type: 'guest', guestSessionId: 'guest-session-1' },
      cartId: undefined,
      shopId: 'shop-1',
    });
    expect(response).toEqual({
      promo_codes: [{
        code: 'SAVE10',
        benefit_type: 'percentage',
        product_scope: 'all',
        amount_off: 0,
        percent_off: 10,
        min_order_type: 'none',
        min_order_value: 0,
        min_purchase_quantity: 0,
        end_date: new Date('2027-01-01T00:00:00.000Z'),
        currency: 'USD',
        is_eligible: true,
        ineligible_reason: null,
      }, {
        code: 'MUGONLY',
        benefit_type: 'percentage',
        product_scope: 'specific',
        amount_off: 0,
        percent_off: 5,
        min_order_type: 'none',
        min_order_value: 0,
        min_purchase_quantity: 0,
        end_date: new Date('2027-01-01T00:00:00.000Z'),
        currency: 'USD',
        is_eligible: false,
        ineligible_reason: 'product_scope',
      }],
    });
  });

  it('returns promo codes after a promo code selection', async () => {
    const { controller, applyPromoCodeUseCase } = buildController();
    applyPromoCodeUseCase.execute.mockResolvedValue({
      promoCodes: ['FREESHIP', 'SAVE10'],
      appliedPromoCodes: [
        { code: 'FREESHIP', benefitType: 'free_shipping' as never },
        { code: 'SAVE10', benefitType: 'percentage' as never },
      ],
    });

    const response = await controller.applyPromoCode(
      { user: { userId: 'user-1' } } as never,
      {
        shopId: 'shop_1',
        code: 'SAVE10',
        promoCodes: ['FREESHIP'],
      } as never,
    );

    expect(applyPromoCodeUseCase.execute).toHaveBeenCalledWith({
      actor: { type: 'user', userId: 'user-1' },
      cartId: undefined,
      shopId: 'shop-1',
      code: 'SAVE10',
      promoCodes: ['FREESHIP'],
    });
    expect(response).toEqual({
      promo_codes: ['FREESHIP', 'SAVE10'],
      applied_promo_codes: [
        { code: 'FREESHIP', benefit_type: 'free_shipping' },
        { code: 'SAVE10', benefit_type: 'percentage' },
      ],
    });
  });
});
