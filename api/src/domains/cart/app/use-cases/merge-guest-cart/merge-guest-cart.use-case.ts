import { Injectable } from '@nestjs/common';
import { CartRepository } from '../../ports/cart.repository';
import type { CartSnapshot } from '../../cart.types';

@Injectable()
export class MergeGuestCartUseCase {
  constructor(private readonly cartRepository: CartRepository) {}

  async execute(guestSessionId: string, userId: string): Promise<CartSnapshot | null> {
    return this.cartRepository.mergeGuestCartIntoUser(guestSessionId, userId);
  }
}
