import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { resolvePromotionStatus } from '~/domains/promotion/domain/promotion-lifecycle';
import {
  isValidTimeZone,
  parseLocalDateTime,
  resolveLocalDateTime,
  resolveLocalDateTimeWithOffset,
} from '~/domains/promotion/domain/local-date-time';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { PromotionProductEntity } from '~/domains/promotion/infra/persistence/entities/promotion-product.entity';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import {
  SaleEndAfterStartRequiredError,
  SaleLocalTimeAmbiguousError,
  SaleLocalTimeNonexistentError,
  SaleProductScopeInvalidError,
  SaleScheduleInvalidError,
  SaleTimeZoneInvalidError,
  ShopAccessDeniedError,
  ShopNotFoundError,
} from '../../errors/shop-app.error';
import type { CreateShopSaleDto } from '../../../api/rest/dto/create-shop-sale.dto';
import type { ShopSaleSummary } from '../../shop.types';
import { dispatchShopProjection } from '../shop-coupon-catalog-projection';

@Injectable()
export class CreateShopSaleUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    body: CreateShopSaleDto,
  ): Promise<ShopSaleSummary> {
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
      throw new SaleTimeZoneInvalidError(body.timezone);
    }

    const now = new Date();
    const startAt = body.start_now === true
      ? now
      : this.resolveBoundary('start', body.start_local, body.start_offset_minutes, body.timezone);
    const endAt = this.resolveBoundary('end', body.end_local, body.end_offset_minutes, body.timezone);

    if (startAt.getTime() >= endAt.getTime()) {
      throw new SaleEndAfterStartRequiredError();
    }

    const productIds = body.product_scope === PromotionProductScope.SPECIFIC
      ? await this.resolveProductScope(entityManager, shopId, body.product_ids ?? [])
      : [];

    const repository = entityManager.getRepository(PromotionEntity);
    const promotion = repository.create({
      shop,
      name: body.name.trim(),
      applicationKind: PromotionApplicationKind.SALE,
      benefitType: PromotionBenefitType.PERCENTAGE,
      currency: shop.currency,
      percentOff: body.percent_off,
      productScope: body.product_scope,
      startAt,
      endAt,
      timezone: body.timezone,
    });

    const targets = productIds.map((productId) =>
      entityManager.getRepository(PromotionProductEntity).create({
        promotion,
        productId,
      }));

    await entityManager.persist([promotion, ...targets]).flush();

    await this.scheduleSaleProjection(promotion, productIds, now);

    return {
      id: promotion.id,
      shopId: shop.id,
      name: promotion.name,
      percentOff: promotion.percentOff ?? 0,
      productScope: promotion.productScope,
      productIds,
      currency: promotion.currency,
      startAt: promotion.startAt,
      endAt: promotion.endAt,
      timezone: promotion.timezone,
      status: resolvePromotionStatus(promotion, now),
      cancelledAt: promotion.cancelledAt ?? null,
      endedAt: promotion.endedAt ?? null,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
    };
  }

  /**
   * Resolves one authored wall clock into the instant a Sale boundary falls on,
   * rejecting the two daylight-saving cases a silent resolution would hide.
   * An explicit UTC offset in minutes disambiguates a repeated fall-back local
   * time; a local time that does not exist is always rejected.
   */
  private resolveBoundary(
    boundary: 'start' | 'end',
    local: string | undefined,
    offsetMinutes: number | undefined,
    timezone: string,
  ): Date {
    const parts = local ? parseLocalDateTime(local) : undefined;

    if (!parts) {
      throw new SaleScheduleInvalidError(`The sale ${boundary} is missing or malformed`);
    }

    if (offsetMinutes !== undefined) {
      const instant = resolveLocalDateTimeWithOffset(parts, timezone, offsetMinutes);

      if (!instant) {
        throw new SaleLocalTimeNonexistentError(boundary);
      }

      return instant;
    }

    const resolution = resolveLocalDateTime(parts, timezone);

    if (resolution.kind === 'nonexistent') {
      throw new SaleLocalTimeNonexistentError(boundary);
    }

    if (resolution.kind === 'ambiguous') {
      throw new SaleLocalTimeAmbiguousError(boundary);
    }

    return resolution.instant;
  }

  /**
   * Validates explicit Product targets: every target must exist in the owning
   * shop and each may be listed once. Selected Products include all their
   * purchasable Product Variants by construction, so no variant rows are
   * enumerated here.
   */
  private async resolveProductScope(
    entityManager: EntityManager,
    shopId: string,
    productIds: string[],
  ): Promise<string[]> {
    if (new Set(productIds).size !== productIds.length) {
      throw new SaleProductScopeInvalidError('Selected products must be unique');
    }

    const products = await entityManager.getRepository(ProductEntity).find(
      { id: { $in: productIds } },
      { populate: ['shop'] },
    );
    const productsById = new Map(products.map((product) => [product.id, product]));

    for (const productId of productIds) {
      const product = productsById.get(productId);

      if (!product) {
        throw new SaleProductScopeInvalidError('A selected product was not found');
      }

      if (product.shop.id !== shopId) {
        throw new SaleProductScopeInvalidError('A selected product belongs to another shop');
      }
    }

    return productIds;
  }

  /**
   * Refreshes the affected catalog projections now, at the Sale's start, and at
   * its end. Projection stays derived display data; the checkout quote and
   * Order commitment re-resolve Sale pricing independently.
   */
  private async scheduleSaleProjection(
    promotion: PromotionEntity,
    productIds: string[],
    now: Date,
  ): Promise<void> {
    const startAt = promotion.startAt.getTime();
    const endAt = promotion.endAt.getTime();
    const nowMs = now.getTime();
    const targetProductIds = productIds.length > 0 ? productIds : undefined;

    if (startAt <= nowMs && endAt > nowMs) {
      await dispatchShopProjection(
        this.jobDispatcher,
        promotion.shop.id,
        targetProductIds,
        `sale-${promotion.id}-now`,
      );
    }

    if (startAt > nowMs) {
      await dispatchShopProjection(
        this.jobDispatcher,
        promotion.shop.id,
        targetProductIds,
        `sale-${promotion.id}-start-${startAt}`,
        startAt - nowMs,
      );
    }

    if (endAt > nowMs) {
      await dispatchShopProjection(
        this.jobDispatcher,
        promotion.shop.id,
        targetProductIds,
        `sale-${promotion.id}-end-${endAt}`,
        endAt - nowMs,
      );
    }
  }
}
