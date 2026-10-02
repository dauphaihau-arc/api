import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { isValidTimeZone } from '~/domains/promotion/domain/local-date-time';
import {
  AmbiguousPromotionLocalTimeError,
  InvalidPromotionScheduleError,
  NonexistentPromotionLocalTimeError,
  resolvePromotionScheduleBoundary,
} from '~/domains/promotion/domain/schedule-boundary';
import { PromotionCodeEntity } from '~/domains/promotion/infra/persistence/entities/promotion-code.entity';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { PromotionProductEntity } from '~/domains/promotion/infra/persistence/entities/promotion-product.entity';
import { Clock } from '~/platform/time/clock';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import {
  PromoCodeAlreadyExistsError,
  PromoCodeEndAfterStartRequiredError,
  PromoCodeLocalTimeAmbiguousError,
  PromoCodeLocalTimeNonexistentError,
  PromoCodeProductScopeInvalidError,
  PromoCodeScheduleInvalidError,
  PromoCodeTimeZoneInvalidError,
  ShopAccessDeniedError,
  ShopNotFoundError,
} from '../../errors/shop-app.error';
import type { CreateShopPromoCodeDto } from '../../../api/rest/dto/create-shop-promo-code.dto';
import type { ShopPromoCodeSummary } from '../../shop.types';
import { toShopPromoCodeSummary } from '../../promo-code-summary.mapper';

@Injectable()
export class CreateShopPromoCodeUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    body: CreateShopPromoCodeDto,
  ): Promise<ShopPromoCodeSummary> {
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

    if (!isValidTimeZone(body.timezone)) {
      throw new PromoCodeTimeZoneInvalidError(body.timezone);
    }

    const now = this.clock.now();
    const startAt = body.start_now === true
      ? now
      : this.resolveBoundary('start', body.start_local, body.start_offset_minutes, body.timezone);
    const endAt = this.resolveBoundary('end', body.end_local, body.end_offset_minutes, body.timezone);

    if (startAt.getTime() >= endAt.getTime()) {
      throw new PromoCodeEndAfterStartRequiredError();
    }

    const productIds = body.product_scope === PromotionProductScope.SPECIFIC
      ? await this.resolveProductScope(entityManager, shopId, body.product_ids ?? [])
      : [];

    const normalizedCode = body.code.trim().toUpperCase();
    const existingCode = await entityManager.getRepository(PromotionCodeEntity).findOne({
      shopId,
      code: normalizedCode,
    });

    if (existingCode) {
      throw new PromoCodeAlreadyExistsError();
    }

    const promotion = entityManager.getRepository(PromotionEntity).create({
      shop,
      name: body.name.trim(),
      applicationKind: PromotionApplicationKind.CHECKOUT_DISCOUNT,
      benefitType: PromotionBenefitType.PERCENTAGE,
      currency: shop.currency,
      percentOff: body.percent_off,
      productScope: body.product_scope,
      visibility: body.visibility,
      minOrderType: null,
      minOrderValue: 0,
      minPurchaseQuantity: 0,
      maxRedemptions: null,
      maxRedemptionsPerBuyer: null,
      startAt,
      endAt,
      timezone: body.timezone,
    });

    const code = entityManager.getRepository(PromotionCodeEntity).create({
      promotion,
      shopId,
      code: normalizedCode,
    });

    const targets = productIds.map((productId) =>
      entityManager.getRepository(PromotionProductEntity).create({
        promotion,
        productId,
      }));

    await entityManager.persist([promotion, code, ...targets]).flush();

    return toShopPromoCodeSummary(promotion, code.code, productIds, now);
  }

  private resolveBoundary(
    boundary: 'start' | 'end',
    local: string | undefined,
    offsetMinutes: number | undefined,
    timezone: string,
  ): Date {
    try {
      return resolvePromotionScheduleBoundary(boundary, local, offsetMinutes, timezone);
    }
    catch (error) {
      if (error instanceof NonexistentPromotionLocalTimeError) {
        throw new PromoCodeLocalTimeNonexistentError(error.boundary);
      }

      if (error instanceof AmbiguousPromotionLocalTimeError) {
        throw new PromoCodeLocalTimeAmbiguousError(error.boundary);
      }

      if (error instanceof InvalidPromotionScheduleError) {
        throw new PromoCodeScheduleInvalidError(error.message);
      }

      throw error;
    }
  }

  private async resolveProductScope(
    entityManager: EntityManager,
    shopId: string,
    productIds: string[],
  ): Promise<string[]> {
    if (new Set(productIds).size !== productIds.length) {
      throw new PromoCodeProductScopeInvalidError('Selected products must be unique');
    }

    const products = await entityManager.getRepository(ProductEntity).find(
      { id: { $in: productIds } },
      { populate: ['shop'] },
    );
    const productsById = new Map(products.map((product) => [product.id, product]));

    for (const productId of productIds) {
      const product = productsById.get(productId);

      if (!product) {
        throw new PromoCodeProductScopeInvalidError('A selected product was not found');
      }

      if (product.shop.id !== shopId) {
        throw new PromoCodeProductScopeInvalidError('A selected product belongs to another shop');
      }
    }

    return productIds;
  }
}
