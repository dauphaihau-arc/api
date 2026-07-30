import { Injectable } from '@nestjs/common';
import { CartRepository } from '../../ports/cart.repository';
import type { CartActor, CartSnapshot } from '../../cart.types';

@Injectable()
export class GetCartUseCase {
  constructor(private readonly cartRepository: CartRepository) {}

  async execute(
    actor: CartActor,
    cartId?: string,
  ): Promise<CartSnapshot | null> {
    if (cartId) {
      return this.cartRepository.findCartByIdForActor(actor, cartId);
    }

    return this.cartRepository.findActiveCart(actor);
  }
}
