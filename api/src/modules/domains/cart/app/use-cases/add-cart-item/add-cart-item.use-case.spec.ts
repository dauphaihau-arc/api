import { AddCartItemUseCase } from './add-cart-item.use-case';
import type { CartRepository } from '../../ports/cart.repository';
import { CartKind } from '../../../domain/enums/cart-kind.enum';

describe('AddCartItemUseCase', () => {
  const actor = {
    type: 'user' as const,
    userId: 'user-1',
  };

  it('creates a temp cart when requested', async () => {
    const createTempCart = jest.fn().mockResolvedValue({
      id: 'cart-1',
      userId: actor.userId,
      guestSessionId: null,
      kind: CartKind.BUY_NOW,
      items: [],
    });

    const useCase = new AddCartItemUseCase({
      findInventoryCandidateById: jest.fn().mockResolvedValue({
        inventoryId: 'inventory-1',
        productId: 'product-1',
        shopId: 'shop-1',
        shopName: 'Clay House',
        title: 'Mug',
        variantType: 'none',
        stock: 5,
        productState: 'active',
      }),
      findCartByIdForActor: jest.fn(),
      findActiveCart: jest.fn(),
      addItemToActiveCart: jest.fn(),
      createBuyNowCart: createTempCart,
      updateCartItem: jest.fn(),
      deleteCartItem: jest.fn(),
    } as unknown as CartRepository);

    const result = await useCase.execute(actor, {
      inventoryId: 'inventory-1',
      quantity: 2,
      isTemp: true,
    });

    expect(result.isOk).toBe(true);
    expect(createTempCart).toHaveBeenCalledWith(actor, 'inventory-1', 2);
  });

  it('rejects quantity that exceeds stock', async () => {
    const useCase = new AddCartItemUseCase({
      findInventoryCandidateById: jest.fn().mockResolvedValue({
        inventoryId: 'inventory-1',
        productId: 'product-1',
        shopId: 'shop-1',
        shopName: 'Clay House',
        title: 'Mug',
        variantType: 'none',
        stock: 1,
        productState: 'active',
      }),
      findCartByIdForActor: jest.fn(),
      findActiveCart: jest.fn(),
      addItemToActiveCart: jest.fn(),
      createBuyNowCart: jest.fn(),
      updateCartItem: jest.fn(),
      deleteCartItem: jest.fn(),
    } as unknown as CartRepository);

    const result = await useCase.execute(actor, {
      inventoryId: 'inventory-1',
      quantity: 2,
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected an error result');
    }
    expect(result.error.message).toContain('exceeds stock');
  });
});
