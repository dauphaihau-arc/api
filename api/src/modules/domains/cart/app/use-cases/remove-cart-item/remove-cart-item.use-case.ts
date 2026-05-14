import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import {
  CartItemNotFoundError,
  CartNotFoundError,
  type CartAppError
} from '../../errors/cart-app.error';
import { CartRepository } from '../../ports/cart.repository';
import type { CartSnapshot } from '../../cart.types';

@Injectable()
export class RemoveCartItemUseCase {
  constructor(private readonly cartRepository: CartRepository) {}

  async execute(
    actor: AuthenticatedUser,
    inventoryId: string,
    cartId?: string
  ): Promise<Result<CartSnapshot | null, CartAppError>> {
    const existingCart = cartId
      ? await this.cartRepository.findOwnedCartById(actor.userId, cartId)
      : await this.cartRepository.findActiveCartByUserId(actor.userId);

    if (!existingCart) {
      return err(new CartNotFoundError());
    }

    const existingItem = existingCart.items.find(
      (item) => item.inventory.inventoryId === inventoryId
    );

    if (!existingItem) {
      return err(new CartItemNotFoundError());
    }

    const cart = await this.cartRepository.deleteOwnedCartItem({
      userId: actor.userId,
      cartId,
      inventoryId,
    });

    return ok(cart);
  }
}
