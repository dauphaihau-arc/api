import { PromotionStatus } from './enums/promotion-status.enum';

export interface PromotionLifecycle {
  startAt: Date;
  endAt: Date;
  cancelledAt?: Date | null;
  endedAt?: Date | null;
}

/**
 * The lifecycle status of a Promotion at `now`.
 *
 * A cancelled Promotion stays cancelled; an ended one stays ended. Otherwise
 * the Promotion Period decides: the start instant is inclusive and the end
 * instant is exclusive, so a Promotion is active from its start up to (but not
 * including) its end.
 */
export function resolvePromotionStatus(
  promotion: PromotionLifecycle,
  now: Date = new Date(),
): PromotionStatus {
  if (promotion.cancelledAt) {
    return PromotionStatus.CANCELLED;
  }

  if (promotion.endedAt) {
    return PromotionStatus.ENDED;
  }

  if (now.getTime() < promotion.startAt.getTime()) {
    return PromotionStatus.SCHEDULED;
  }

  if (now.getTime() >= promotion.endAt.getTime()) {
    return PromotionStatus.ENDED;
  }

  return PromotionStatus.ACTIVE;
}
