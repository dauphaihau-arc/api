import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import { AddCartItemUseCase } from './add-cart-item.use-case';
import { CartRepository } from '../../ports/cart.repository';

describe('AddCartItemUseCase', () => {
  const actor = {
    userId: 'user-1',
    email: 'cart@example.com',
    displayName: 'Cart User',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: ['member'],
    permissions: [],
  };

  it('creates a temp cart when requested', async () => {
    const createTempCart = jest.fn().mockResolvedValue({
      id: 'cart-1',
      userId: actor.userId,
      isTemp: true,
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
        price: 10,
        productState: 'active',
      }),
      findOwnedCartById: jest.fn(),
      findActiveCartByUserId: jest.fn(),
      addItemToActiveCart: jest.fn(),
      createTempCart,
      updateOwnedCartItem: jest.fn(),
      deleteOwnedCartItem: jest.fn(),
    } as unknown as CartRepository);

    const result = await useCase.execute(actor, {
      inventoryId: 'inventory-1',
      quantity: 2,
      isTemp: true,
    });

    expect(result.isOk).toBe(true);
    expect(createTempCart).toHaveBeenCalledWith(actor.userId, 'inventory-1', 2);
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
        price: 10,
        productState: 'active',
      }),
      findOwnedCartById: jest.fn(),
      findActiveCartByUserId: jest.fn(),
      addItemToActiveCart: jest.fn(),
      createTempCart: jest.fn(),
      updateOwnedCartItem: jest.fn(),
      deleteOwnedCartItem: jest.fn(),
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
