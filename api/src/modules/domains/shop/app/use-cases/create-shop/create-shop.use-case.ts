import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import { toSlug } from '~/common/utils/slugify';
import { AuthUserRepository } from '~/modules/domains/auth/app/ports/auth-user.repository';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { RoleKey } from '~/modules/domains/auth/domain/value-objects/role-key';
import {
  ShopNameAlreadyTakenError,
  ShopSlugAlreadyTakenError,
  ShopSlugReservedError,
  UserAlreadyOwnsShopError
} from '../../errors/shop-app.error';
import { ShopRepository } from '../../ports/shop.repository';
import type { ShopSummary } from '../../shop.types';

export interface CreateShopInput {
  shopName: string;
}

@Injectable()
export class CreateShopUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly shopRepository: ShopRepository,
    private readonly authUserRepository: AuthUserRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: CreateShopInput
  ): Promise<Result<
    ShopSummary,
    ShopNameAlreadyTakenError | ShopSlugAlreadyTakenError | ShopSlugReservedError | UserAlreadyOwnsShopError
  >> {
    const trimmedShopName = input.shopName.trim();
    const slug = toSlug(trimmedShopName);

    const existingOwnedShop = await this.shopRepository.findByOwnerUserId(
      actor.userId
    );

    if (existingOwnedShop) {
      return err(new UserAlreadyOwnsShopError());
    }

    const existingName = await this.shopRepository.findByShopName(
      trimmedShopName
    );

    if (existingName) {
      return err(new ShopNameAlreadyTakenError());
    }

    if (RESERVED_SHOP_SLUGS.has(slug)) {
      return err(new ShopSlugReservedError(slug));
    }

    const existingSlug = await this.shopRepository.findBySlug(slug);

    if (existingSlug) {
      return err(new ShopSlugAlreadyTakenError());
    }

    const shop = await this.entityManager.transactional(async (entityManager) => {
      const createdShop = await this.shopRepository.create(
        {
          ownerUserId: actor.userId,
          shopName: trimmedShopName,
          slug,
        },
        entityManager
      );

      await this.authUserRepository.assignRole(
        actor.userId,
        RoleKey.create('seller'),
        entityManager
      );

      return createdShop;
    });

    return ok(shop);
  }
}

const RESERVED_SHOP_SLUGS = new Set([
  'account',
  'api',
  'c',
  'cart',
  'checkout',
  'login',
  'orders',
  'products',
  'reset',
  'search',
  'shop',
  'shops',
  'signup',
  'success',
]);
