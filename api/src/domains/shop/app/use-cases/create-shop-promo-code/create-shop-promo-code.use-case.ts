import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionMinOrderType } from '~/domains/promotion/domain/enums/promotion-min-order-type.enum';
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
  PromoCodeBenefitInvalidError,
  PromoCodeConditionInvalidError,
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

    const benefit = this.resolveBenefitAndCondition(body);

    // Free shipping waives a shop's Shipping Charge, so it is inherently
    // shop-wide: it never targets selected Products.
    if (
      benefit.benefitType === PromotionBenefitType.FREE_SHIPPING
      && body.product_scope === PromotionProductScope.SPECIFIC
    ) {
      throw new PromoCodeProductScopeInvalidError(
        'A free-shipping promo code is always shop-wide',
      );
    }

    const productScope = benefit.benefitType === PromotionBenefitType.FREE_SHIPPING
      ? PromotionProductScope.ALL
      : body.product_scope;

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

    const productIds = productScope === PromotionProductScope.SPECIFIC
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
      benefitType: benefit.benefitType,
      currency: shop.currency,
      percentOff: benefit.percentOff,
      amountOff: benefit.amountOff,
      productScope,
      visibility: body.visibility,
      minOrderType: benefit.minOrderType,
      minOrderValue: benefit.minOrderValue,
      minPurchaseQuantity: benefit.minPurchaseQuantity,
      maxRedemptions: body.max_redemptions ?? null,
      maxRedemptionsPerBuyer: body.max_redemptions_per_buyer ?? null,
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

    return toShopPromoCodeSummary(promotion, code.code, productIds, now, 0);
  }

  /**
   * Normalizes the benefit and qualifying condition into the exact fields the
   * Promotion persists, rejecting contradictory combinations the DTO cannot
   * express on a single field. A percentage code never carries a fixed amount
   * (or vice versa), a free-shipping code carries neither, and only the value
   * matching the selected minimum type is accepted, so a zero-value or
   * mismatched condition can never be stored.
   */
  private resolveBenefitAndCondition(body: CreateShopPromoCodeDto): {
    benefitType: PromotionBenefitType;
    percentOff: number | null;
    amountOff: number | null;
    minOrderType: PromotionMinOrderType;
    minOrderValue: number;
    minPurchaseQuantity: number;
  } {
    const benefitType = body.benefit_type;
    const percentOff = body.percent_off;
    const amountOff = body.amount_off;

    if (benefitType === PromotionBenefitType.FIXED_AMOUNT) {
      if (percentOff != null) {
        throw new PromoCodeBenefitInvalidError(
          'A fixed-amount promo code cannot also have a percentage',
        );
      }
      if (amountOff == null || amountOff <= 0) {
        throw new PromoCodeBenefitInvalidError('A fixed-amount promo code needs a positive amount');
      }
    }
    else if (benefitType === PromotionBenefitType.FREE_SHIPPING) {
      if (percentOff != null) {
        throw new PromoCodeBenefitInvalidError(
          'A free-shipping promo code cannot also have a percentage',
        );
      }
      if (amountOff != null) {
        throw new PromoCodeBenefitInvalidError(
          'A free-shipping promo code cannot also have a fixed amount',
        );
      }
    }
    else {
      if (amountOff != null) {
        throw new PromoCodeBenefitInvalidError(
          'A percentage promo code cannot also have a fixed amount',
        );
      }
      if (percentOff == null || percentOff < 1 || percentOff > 99) {
        throw new PromoCodeBenefitInvalidError('A percentage promo code needs a percentage from 1 to 99');
      }
    }

    const minOrderType = body.min_order_type;
    const minOrderValue = body.min_order_value;
    const minPurchaseQuantity = body.min_purchase_quantity;

    if (minOrderType === PromotionMinOrderType.ORDER_TOTAL) {
      if (minPurchaseQuantity != null) {
        throw new PromoCodeConditionInvalidError(
          'A minimum-spend condition cannot also set a minimum quantity',
        );
      }
      if (minOrderValue == null || minOrderValue <= 0) {
        throw new PromoCodeConditionInvalidError('A minimum-spend condition needs a positive amount');
      }
    }
    else if (minOrderType === PromotionMinOrderType.PURCHASE_QUANTITY) {
      if (minOrderValue != null) {
        throw new PromoCodeConditionInvalidError(
          'A minimum-quantity condition cannot also set a minimum spend',
        );
      }
      if (minPurchaseQuantity == null || minPurchaseQuantity < 1) {
        throw new PromoCodeConditionInvalidError('A minimum-quantity condition needs a positive quantity');
      }
    }
    else if (minOrderValue != null || minPurchaseQuantity != null) {
      throw new PromoCodeConditionInvalidError(
        'A no-minimum promo code cannot set a minimum spend or quantity',
      );
    }

    return {
      benefitType,
      percentOff: benefitType === PromotionBenefitType.PERCENTAGE ? percentOff ?? null : null,
      amountOff: benefitType === PromotionBenefitType.FIXED_AMOUNT ? amountOff ?? null : null,
      minOrderType,
      minOrderValue: minOrderType === PromotionMinOrderType.ORDER_TOTAL
        ? minOrderValue ?? 0
        : 0,
      minPurchaseQuantity: minOrderType === PromotionMinOrderType.PURCHASE_QUANTITY
        ? minPurchaseQuantity ?? 0
        : 0,
    };
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
