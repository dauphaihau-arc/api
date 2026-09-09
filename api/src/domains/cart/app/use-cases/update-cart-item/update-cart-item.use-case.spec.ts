import type { PurchaseEligibilityResult, PurchaseEligibilityService } from '~/domains/product/app/services/purchase-eligibility.service';
import { CartKind } from '../../../domain/enums/cart-kind.enum';
import type { CartRepository } from '../../ports/cart.repository';
import { UpdateCartItemUseCase } from './update-cart-item.use-case';

const actor = {
  type: 'user' as const,
  userId: 'user-1',
};

function buildRepository(): jest.Mocked<CartRepository> {
  return {
    findInventoryCandidateById: jest.fn().mockResolvedValue({
      inventoryId: 'inventory-1',
      productId: 'product-1',
      shopId: 'shop-1',
      shopName: 'Clay House',
      title: 'Mug',
      stock: 5,
      productState: 'active',
    }),
    findCartByIdForActor: jest.fn(),
    findActiveCart: jest.fn().mockResolvedValue({
      id: 'cart-1',
      userId: actor.userId,
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [{
        id: 'item-1',
        quantity: 1,
        isSelectOrder: true,
        updatedAt: new Date('2026-09-06T00:00:00.000Z'),
        inventory: { inventoryId: 'inventory-1' },
      }],
    }),
    addItemToActiveCart: jest.fn(),
    createBuyNowCart: jest.fn(),
    updateCartItem: jest.fn().mockResolvedValue({
      id: 'cart-1',
      userId: actor.userId,
      guestSessionId: null,
      kind: CartKind.ACTIVE,
      items: [],
    }),
    deleteCartItem: jest.fn(),
    mergeGuestCartIntoUser: jest.fn(),
  } as unknown as jest.Mocked<CartRepository>;
}

function buildEligibility(result: PurchaseEligibilityResult = { eligible: true, failures: [] }) {
  return {
    evaluate: jest.fn().mockResolvedValue(result),
  } as unknown as jest.Mocked<PurchaseEligibilityService>;
}

describe('UpdateCartItemUseCase', () => {
  it.each([
    ['inactive product', 'product_inactive'],
    ['inactive variant', 'variant_inactive'],
    ['removed variant', 'variant_inactive'],
  ] as const)('rejects quantity updates for an %s', async (_label, reason) => {
    const repository = buildRepository();
    const eligibility = buildEligibility({
      eligible: false,
      failures: [{ inventoryId: 'inventory-1', quantity: 2, reason }],
    });
    const useCase = new UpdateCartItemUseCase(repository, eligibility);

    const result = await useCase.execute(actor, {
      inventoryId: 'inventory-1',
      quantity: 2,
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected an error result');
    }
    expect(result.error.message).toContain('not available');
    expect(repository.updateCartItem).not.toHaveBeenCalled();
  });

  it('uses the existing quantity when rechecking selection-only cart updates', async () => {
    const repository = buildRepository();
    const eligibility = buildEligibility();
    const useCase = new UpdateCartItemUseCase(repository, eligibility);

    const result = await useCase.execute(actor, {
      inventoryId: 'inventory-1',
      isSelectOrder: true,
    });

    expect(result.isOk).toBe(true);
    expect(eligibility.evaluate).toHaveBeenCalledWith({
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Mug' }],
    });
    expect(repository.updateCartItem).toHaveBeenCalled();
  });
});
