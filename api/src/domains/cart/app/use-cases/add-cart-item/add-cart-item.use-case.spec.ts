import { AddCartItemUseCase } from './add-cart-item.use-case';
import type { CartRepository } from '../../ports/cart.repository';
import { CartKind } from '../../../domain/enums/cart-kind.enum';
import type { PurchaseEligibilityResult, PurchaseEligibilityService } from '~/domains/product/app/services/purchase-eligibility.service';

describe('AddCartItemUseCase', () => {
  const actor = {
    type: 'user' as const,
    userId: 'user-1',
  };

  function buildRepository(overrides?: Record<string, unknown>): jest.Mocked<CartRepository> {
    return {
      findInventoryCandidateById: jest.fn().mockResolvedValue({
        inventoryId: 'inventory-1',
        productId: 'product-1',
        shopId: 'shop-1',
        shopName: 'Clay House',
        title: 'Mug',
        stock: 5,
        productState: 'active',
        ...overrides,
      }),
      findCartByIdForActor: jest.fn(),
      findActiveCart: jest.fn(),
      addItemToActiveCart: jest.fn(),
      createBuyNowCart: jest.fn(),
      updateCartItem: jest.fn(),
      deleteCartItem: jest.fn(),
      mergeGuestCartIntoUser: jest.fn(),
    } as unknown as jest.Mocked<CartRepository>;
  }

  function buildEligibility(
    result: PurchaseEligibilityResult = { eligible: true, failures: [] },
  ): jest.Mocked<PurchaseEligibilityService> {
    return {
      evaluate: jest.fn().mockResolvedValue(result),
    } as unknown as jest.Mocked<PurchaseEligibilityService>;
  }

  it('creates a temp cart when requested', async () => {
    const repository = buildRepository();
    const eligibility = buildEligibility();
    repository.createBuyNowCart.mockResolvedValue({
      id: 'cart-1',
      userId: actor.userId,
      guestSessionId: null,
      kind: CartKind.BUY_NOW,
      items: [],
    });
    const useCase = new AddCartItemUseCase(repository, eligibility);

    const result = await useCase.execute(actor, {
      inventoryId: 'inventory-1',
      quantity: 2,
      isTemp: true,
    });

    expect(result.isOk).toBe(true);
    expect(eligibility.evaluate).toHaveBeenCalledWith({
      items: [{ inventoryId: 'inventory-1', quantity: 2, title: 'Mug' }],
    });
    expect(repository.createBuyNowCart).toHaveBeenCalledWith(actor, 'inventory-1', 2);
  });

  it.each([
    ['inactive product', 'product_inactive'],
    ['inactive variant', 'variant_inactive'],
    ['removed variant', 'variant_inactive'],
  ] as const)('rejects adding an item for an %s', async (_label, reason) => {
    const repository = buildRepository();
    const eligibility = buildEligibility({
      eligible: false,
      failures: [{ inventoryId: 'inventory-1', quantity: 1, reason }],
    });
    const useCase = new AddCartItemUseCase(repository, eligibility);

    const result = await useCase.execute(actor, {
      inventoryId: 'inventory-1',
      quantity: 1,
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected an error result');
    }
    expect(result.error.message).toContain('not available');
    expect(repository.addItemToActiveCart).not.toHaveBeenCalled();
  });

  it('rejects quantity that exceeds available inventory', async () => {
    const repository = buildRepository();
    const eligibility = buildEligibility({
      eligible: false,
      failures: [{
        inventoryId: 'inventory-1',
        quantity: 2,
        reason: 'insufficient_available_quantity',
      }],
    });
    const useCase = new AddCartItemUseCase(repository, eligibility);

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
