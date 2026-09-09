import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import {
  CartItemNotFoundError,
  CartNotFoundError,
  CartQuantityExceedsStockError,
  ProductInventoryNotFoundError,
  ProductUnavailableForCartError,
  type CartAppError,
} from '../../errors/cart-app.error';
import { CartRepository } from '../../ports/cart.repository';
import type { CartActor, CartSnapshot } from '../../cart.types';
import { PurchaseEligibilityService } from '~/domains/product/app/services/purchase-eligibility.service';

export interface UpdateCartItemInput {
  cartId?: string;
  inventoryId: string;
  quantity?: number;
  isSelectOrder?: boolean;
}

@Injectable()
export class UpdateCartItemUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly purchaseEligibilityService: PurchaseEligibilityService,
  ) {}

  async execute(
    actor: CartActor,
    input: UpdateCartItemInput,
  ): Promise<Result<CartSnapshot | null, CartAppError>> {
    const inventory = await this.cartRepository.findInventoryCandidateById(
      input.inventoryId,
    );

    if (!inventory) {
      return err(new ProductInventoryNotFoundError(input.inventoryId));
    }

    const existingCart = input.cartId
      ? await this.cartRepository.findCartByIdForActor(actor, input.cartId)
      : await this.cartRepository.findActiveCart(actor);

    if (!existingCart) {
      return err(new CartNotFoundError());
    }

    const existingItem = existingCart.items.find(
      (item) => item.inventory.inventoryId === input.inventoryId,
    );

    if (!existingItem) {
      return err(new CartItemNotFoundError());
    }

    const eligibility = await this.purchaseEligibilityService.evaluate({
      items: [{
        inventoryId: input.inventoryId,
        quantity: input.quantity && input.quantity > 0
          ? input.quantity
          : existingItem.quantity,
        title: inventory.title,
      }],
    });

    if (!eligibility.eligible) {
      const reason = eligibility.failures[0]?.reason;

      return err(reason === 'insufficient_available_quantity'
        ? new CartQuantityExceedsStockError()
        : new ProductUnavailableForCartError());
    }

    const cart = await this.cartRepository.updateCartItem({
      actor,
      cartId: input.cartId,
      inventoryId: input.inventoryId,
      quantity: input.quantity,
      isSelectOrder: input.isSelectOrder,
    });

    return ok(cart);
  }
}
