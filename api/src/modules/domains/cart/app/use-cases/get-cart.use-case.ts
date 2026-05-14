import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CartRepository } from '../ports/cart.repository';
import type { CartSnapshot } from '../cart.types';

@Injectable()
export class GetCartUseCase {
  constructor(private readonly cartRepository: CartRepository) {}

  async execute(
    actor: AuthenticatedUser,
    cartId?: string
  ): Promise<CartSnapshot | null> {
    if (cartId) {
      return this.cartRepository.findOwnedCartById(actor.userId, cartId);
    }

    return this.cartRepository.findActiveCartByUserId(actor.userId);
  }
}
