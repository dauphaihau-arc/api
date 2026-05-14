import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '../../ports/shop.repository';
import type { ShopSummary } from '../../shop.types';

@Injectable()
export class GetMyShopUseCase {
  constructor(private readonly shopRepository: ShopRepository) {}

  async execute(actor: AuthenticatedUser): Promise<ShopSummary | null> {
    return this.shopRepository.findByOwnerUserId(actor.userId);
  }
}
