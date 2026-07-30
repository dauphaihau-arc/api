import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import {
  CartQuantityExceedsStockError,
  ProductInventoryNotFoundError,
  ProductUnavailableForCartError,
  type CartAppError,
} from '../../errors/cart-app.error';
import { CartRepository } from '../../ports/cart.repository';
import type { CartActor, CartSnapshot } from '../../cart.types';

export interface AddCartItemInput {
  inventoryId: string;
  quantity: number;
  isTemp?: boolean;
}

@Injectable()
export class AddCartItemUseCase {
  constructor(private readonly cartRepository: CartRepository) {}

  async execute(
    actor: CartActor,
    input: AddCartItemInput,
  ): Promise<Result<CartSnapshot, CartAppError>> {
    const inventory = await this.cartRepository.findInventoryCandidateById(
      input.inventoryId,
    );

    if (!inventory) {
      return err(new ProductInventoryNotFoundError(input.inventoryId));
    }

    if (inventory.productState !== 'active' || inventory.stock <= 0) {
      return err(new ProductUnavailableForCartError());
    }

    if (input.quantity > inventory.stock) {
      return err(new CartQuantityExceedsStockError());
    }

    const cart = input.isTemp
      ? await this.cartRepository.createBuyNowCart(
        actor,
        input.inventoryId,
        input.quantity,
      )
      : await this.cartRepository.addItemToActiveCart(
        actor,
        input.inventoryId,
        input.quantity,
      );

    return ok(cart);
  }
}
