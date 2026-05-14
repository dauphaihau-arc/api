import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopNameAlreadyTakenError, UserAlreadyOwnsShopError } from '../../errors/shop-app.error';
import { ShopRepository } from '../../ports/shop.repository';
import type { ShopSummary } from '../../shop.types';

export interface CreateShopInput {
  shopName: string;
}

@Injectable()
export class CreateShopUseCase {
  constructor(private readonly shopRepository: ShopRepository) {}

  async execute(
    actor: AuthenticatedUser,
    input: CreateShopInput
  ): Promise<Result<ShopSummary, ShopNameAlreadyTakenError | UserAlreadyOwnsShopError>> {
    const existingOwnedShop = await this.shopRepository.findByOwnerUserId(
      actor.userId
    );

    if (existingOwnedShop) {
      return err(new UserAlreadyOwnsShopError());
    }

    const existingName = await this.shopRepository.findByShopName(
      input.shopName.trim()
    );

    if (existingName) {
      return err(new ShopNameAlreadyTakenError());
    }

    const shop = await this.shopRepository.create({
      ownerUserId: actor.userId,
      shopName: input.shopName.trim(),
    });

    return ok(shop);
  }
}
