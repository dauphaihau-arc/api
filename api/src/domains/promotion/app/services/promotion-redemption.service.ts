import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { assertRedemptionAllowed } from '../../domain/promotion-redemption';
import { PromotionCodeEntity } from '../../infra/persistence/entities/promotion-code.entity';
import { PromotionEntity } from '../../infra/persistence/entities/promotion.entity';
import { PromotionUsageEntity } from '../../infra/persistence/entities/promotion-usage.entity';

/**
 * Records the redemptions an Order consumes, inside the caller's Order-creation
 * transaction so the allowance check and the usage write commit or roll back
 * together.
 *
 * Concurrency safety comes from locking the Promotion rows the order is about
 * to redeem, in a stable id order, before counting: a second commitment blocks
 * until the first commits, then observes its usage and fails its limit check
 * instead of oversubscribing the final allowance. Idempotency comes from
 * checking `(promotion, order_id)` before inserting, so a replay of the same
 * order never consumes twice.
 */
@Injectable()
export class PromotionRedemptionService {
  async consumeForOrder(
    entityManager: EntityManager,
    input: {
      shopId: string;
      codes: string[];
      orderId: string;
      userId?: string;
    },
  ): Promise<void> {
    const codes = [
      ...new Set(input.codes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
    ];

    if (codes.length === 0) {
      return;
    }

    const codeEntities = await entityManager.getRepository(PromotionCodeEntity).find(
      {
        shopId: input.shopId,
        code: { $in: codes },
      },
      { populate: ['promotion'] },
    );

    if (codeEntities.length === 0) {
      return;
    }

    const promotionIds = [...new Set(codeEntities.map((code) => code.promotion.id))].sort();

    // Lock every Promotion the order redeems before reading any count. A
    // Promotion belongs to exactly one shop, so shops never contend on the same
    // rows; within one shop the sorted order keeps concurrent commitments from
    // deadlocking on each other.
    const lockedPromotions = await entityManager.getRepository(PromotionEntity).find(
      { id: { $in: promotionIds } },
      {
        lockMode: LockMode.PESSIMISTIC_WRITE,
        orderBy: { id: 'asc' },
      },
    );

    const promotionById = new Map(
      lockedPromotions.map((promotion) => [promotion.id, promotion]),
    );

    const usageRepository = entityManager.getRepository(PromotionUsageEntity);

    const orderedCodeEntities = [...codeEntities].sort((left, right) =>
      left.promotion.id.localeCompare(right.promotion.id));

    for (const codeEntity of orderedCodeEntities) {
      const promotionId = codeEntity.promotion.id;
      const promotion = promotionById.get(promotionId);

      if (!promotion) {
        continue;
      }

      const existing = await usageRepository.findOne({
        promotion: { id: promotionId },
        orderId: input.orderId,
      });

      if (existing) {
        continue;
      }

      const totalCount = await usageRepository.count({ promotion: { id: promotionId } });

      const buyerCount = input.userId
        ? await usageRepository.count({
          promotion: { id: promotionId },
          userId: input.userId,
        })
        : 0;

      assertRedemptionAllowed({
        code: codeEntity.code,
        maxRedemptions: promotion.maxRedemptions ?? null,
        maxRedemptionsPerBuyer: promotion.maxRedemptionsPerBuyer ?? null,
        totalCount,
        buyerCount,
        authenticated: Boolean(input.userId),
      });

      const usage = usageRepository.create({
        promotion,
        ...(input.userId ? { userId: input.userId } : {}),
        orderId: input.orderId,
        code: codeEntity.code,
      });
      entityManager.persist(usage);
    }
  }
}
