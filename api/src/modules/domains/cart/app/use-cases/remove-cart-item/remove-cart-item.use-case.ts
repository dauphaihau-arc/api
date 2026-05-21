import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import {
  CartItemNotFoundError,
  CartNotFoundError,
  type CartAppError
} from '../../errors/cart-app.error';
import { CartRepository } from '../../ports/cart.repository';
import type { CartActor, CartSnapshot } from '../../cart.types';

@Injectable()
export class RemoveCartItemUseCase {
  constructor(private readonly cartRepository: CartRepository) {}

  async execute(
    actor: CartActor,
    inventoryId: string,
    cartId?: string
  ): Promise<Result<CartSnapshot | null, CartAppError>> {
    const existingCart = cartId
      ? await this.cartRepository.findCartByIdForActor(actor, cartId)
      : await this.cartRepository.findActiveCart(actor);

    if (!existingCart) {
      return err(new CartNotFoundError());
    }

    const existingItem = existingCart.items.find(
      (item) => item.inventory.inventoryId === inventoryId
    );

    if (!existingItem) {
      return err(new CartItemNotFoundError());
    }

    const cart = await this.cartRepository.deleteCartItem({
      actor,
      cartId,
      inventoryId,
    });

    return ok(cart);
  }
}
