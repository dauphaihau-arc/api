import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { isValidTimeZone } from '~/domains/promotion/domain/local-date-time';
import {
  ShopAccessDeniedError,
  ShopNotFoundError,
  ShopTimeZoneInvalidError,
} from '../../errors/shop-app.error';
import { toShopSummary } from '../../shop-summary';
import type { ShopSummary } from '../../shop.types';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';

export interface UpdateShopSettingsInput {
  timezone: string;
}

/**
 * Changes the shop's own settings.
 *
 * The store timezone is stored on the shop and is what a new Sale schedule
 * defaults to, so the default follows the store rather than whichever device a
 * seller happens to use. It is deliberately not applied to existing Sales:
 * each Sale keeps the timezone it was created with, so neither this write nor a
 * later change reinterprets an already scheduled Promotion Period.
 */
@Injectable()
export class UpdateShopSettingsUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    input: UpdateShopSettingsInput,
  ): Promise<ShopSummary> {
    if (!isValidTimeZone(input.timezone)) {
      throw new ShopTimeZoneInvalidError(input.timezone);
    }

    const entityManager = this.entityManager.fork();
    const shop = await entityManager.getRepository(ShopEntity).findOne(
      { id: shopId },
      { populate: ['ownerUser'] },
    );

    if (!shop) {
      throw new ShopNotFoundError();
    }

    if (shop.ownerUser.id !== actor.userId && !actor.roles.includes('admin')) {
      throw new ShopAccessDeniedError();
    }

    shop.timezone = input.timezone;

    await entityManager.flush();

    return toShopSummary(shop);
  }
}
