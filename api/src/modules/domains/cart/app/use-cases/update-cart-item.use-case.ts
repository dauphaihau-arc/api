import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import {
  CartItemNotFoundError,
  CartNotFoundError,
  CartQuantityExceedsStockError,
  ProductInventoryNotFoundError,
  ProductUnavailableForCartError,
  type CartAppError
} from '../errors/cart-app.error';
import { CartRepository } from '../ports/cart.repository';
import type { CartSnapshot } from '../cart.types';

export interface UpdateCartItemInput {
  cartId?: string;
  inventoryId: string;
  quantity?: number;
  isSelectOrder?: boolean;
}

@Injectable()
export class UpdateCartItemUseCase {
  constructor(private readonly cartRepository: CartRepository) {}

  async execute(
    actor: AuthenticatedUser,
    input: UpdateCartItemInput
  ): Promise<Result<CartSnapshot | null, CartAppError>> {
    const inventory = await this.cartRepository.findInventoryCandidateById(
      input.inventoryId
    );

    if (!inventory) {
      return err(new ProductInventoryNotFoundError(input.inventoryId));
    }

    if (inventory.productState !== 'active') {
      return err(new ProductUnavailableForCartError());
    }

    if (
      input.quantity !== undefined
      && input.quantity > 0
      && input.quantity > inventory.stock
    ) {
      return err(new CartQuantityExceedsStockError());
    }

    const existingCart = input.cartId
      ? await this.cartRepository.findOwnedCartById(actor.userId, input.cartId)
      : await this.cartRepository.findActiveCartByUserId(actor.userId);

    if (!existingCart) {
      return err(new CartNotFoundError());
    }

    const existingItem = existingCart.items.find(
      (item) => item.inventory.inventoryId === input.inventoryId
    );

    if (!existingItem) {
      return err(new CartItemNotFoundError());
    }

    const cart = await this.cartRepository.updateOwnedCartItem({
      userId: actor.userId,
      cartId: input.cartId,
      inventoryId: input.inventoryId,
      quantity: input.quantity,
      isSelectOrder: input.isSelectOrder,
    });

    return ok(cart);
  }
}
