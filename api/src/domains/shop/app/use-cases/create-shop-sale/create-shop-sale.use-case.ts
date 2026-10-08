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
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { PromotionProductEntity } from '~/domains/promotion/infra/persistence/entities/promotion-product.entity';
import { Clock } from '~/platform/time/clock';
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
import { toShopSaleSummary } from '../../sale-summary';
import { scheduleShopPromotionCatalogProjection } from '../shop-promotion-catalog-projection';

@Injectable()
export class CreateShopSaleUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
    private readonly clock: Clock,
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

    const now = this.clock.now();
    const startAt = body.start_now === true
      ? now
      : this.resolveBoundary('start', body.start_local, body.start_offset_minutes, body.timezone);
    const endAt = this.resolveBoundary('end', body.end_local, body.end_offset_minutes, body.timezone);

    if (startAt.getTime() >= endAt.getTime()) {
      throw new SaleEndAfterStartRequiredError();
    }

    const products = body.product_scope === PromotionProductScope.SPECIFIC
      ? await this.resolveProductScope(entityManager, shopId, body.product_ids ?? [])
      : [];
    const productIds = products.map((product) => product.id);

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

    return toShopSaleSummary(promotion, products, now);
  }

  /**
   * Resolves one authored wall clock into the instant a Sale boundary falls on,
   * rejecting the two daylight-saving cases a silent resolution would hide.
   */
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
        throw new SaleLocalTimeNonexistentError(error.boundary);
      }

      if (error instanceof AmbiguousPromotionLocalTimeError) {
        throw new SaleLocalTimeAmbiguousError(error.boundary);
      }

      if (error instanceof InvalidPromotionScheduleError) {
        throw new SaleScheduleInvalidError(error.message);
      }

      throw error;
    }
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
    productPublicIds: string[],
  ): Promise<Array<{ id: string; publicId: string }>> {
    if (productPublicIds.length === 0) return [];
    if (new Set(productPublicIds).size !== productPublicIds.length) {
      throw new SaleProductScopeInvalidError('Selected products must be unique');
    }

    const products = await entityManager.getRepository(ProductEntity).find(
      { publicId: { $in: productPublicIds } },
      { populate: ['shop'] },
    );
    const productsByPublicId = new Map(products.map((product) => [product.publicId, product]));

    for (const productPublicId of productPublicIds) {
      const product = productsByPublicId.get(productPublicId);
      if (!product) throw new SaleProductScopeInvalidError('A selected product was not found');
      if (product.shop.id !== shopId) {
        throw new SaleProductScopeInvalidError('A selected product belongs to another shop');
      }
    }

    return productPublicIds.map((productPublicId) => {
      const product = productsByPublicId.get(productPublicId);
      if (!product) throw new SaleProductScopeInvalidError('A selected product was not found');
      return { id: product.id, publicId: product.publicId };
    });
  }

  /**
   * Refreshes the affected catalog projections now, at the Sale's start, and at
   * its end. Projection stays derived display data; the checkout quote and
   * Order commitment re-resolve Sale pricing independently.
   */
  private async scheduleSaleProjection(
    promotion: PromotionEntity,
    _productIds: string[],
    _now: Date,
  ): Promise<void> {
    await scheduleShopPromotionCatalogProjection(this.jobDispatcher, promotion);
  }
}
