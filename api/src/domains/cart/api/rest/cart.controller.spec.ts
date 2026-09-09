import { NotFoundException } from '@nestjs/common';
import { CartController } from './cart.controller';
import type { GuestCartSessionService } from './guest-cart-session.service';
import { CouponCodeNotFoundError } from '~/domains/coupon/app/services/coupon-pricing.service';
import type { CartUpdatePricingService } from '../../app/services/cart-update-pricing.service';
import type { CartSnapshot } from '../../app/cart.types';
import type { AddCartItemUseCase } from '../../app/use-cases/add-cart-item/add-cart-item.use-case';
import type { GetCartUseCase } from '../../app/use-cases/get-cart/get-cart.use-case';
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

    const controller = new CartController(
      checkoutConfig as never,
      cartUpdatePricingService,
      guestCartSessionService,
      getCartUseCase,
      mergeGuestCartUseCase,
      addCartItemUseCase,
      updateCartItemUseCase,
      removeCartItemUseCase,
    );

    return {
      controller,
      cartUpdatePricingService,
      guestCartSessionService,
      addCartItemUseCase,
      getCartUseCase,
      mergeGuestCartUseCase,
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

  it('prices buy-now coupon updates from temp cart promo codes', async () => {
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
            productSlug: 'mug',
            shopId: 'shop-1',
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

  it('maps rejected promo code pricing to a coupon response error', async () => {
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
            productSlug: 'mug',
            shopId: 'shop-1',
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
    cartUpdatePricingService.buildPricedCartSummary.mockRejectedValue(
      new CouponCodeNotFoundError('MISSING'),
    );

    await expect(controller.updateItem(
      { user: { userId: 'user-1' } } as never,
      {} as never,
      {
        cartId: 'cart-1',
        additionInfoTempCart: {
          promo_codes: ['MISSING'],
        },
      } as never,
    )).rejects.toBeInstanceOf(NotFoundException);
  });
});
