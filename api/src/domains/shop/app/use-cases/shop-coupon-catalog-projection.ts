import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import { CouponAppliesTo } from '~/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponType } from '~/domains/coupon/domain/enums/coupon-type.enum';

interface ProjectableCoupon {
  id: string;
  shop: { id: string };
  appliesTo: CouponAppliesTo;
  appliesProductIds: string[];
  type: CouponType;
  percentOff: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isAutoSale: boolean;
}

export async function scheduleShopCouponCatalogProjection(
  jobDispatcher: JobDispatcher,
  coupon: ProjectableCoupon,
): Promise<void> {
  if (!coupon.isAutoSale || !coupon.isActive || coupon.type !== CouponType.PERCENTAGE || coupon.percentOff <= 0) {
    return;
  }

  const now = Date.now();
  const startAt = coupon.startDate.getTime();
  const endAt = coupon.endDate.getTime();

  const productIds = coupon.appliesTo === CouponAppliesTo.SPECIFIC
    ? coupon.appliesProductIds
    : undefined;

  if (startAt <= now && endAt >= now) {
    await dispatchShopProjection(jobDispatcher, coupon.shop.id, productIds, `coupon-${coupon.id}-now`);
  }

  if (startAt > now) {
    await dispatchShopProjection(
      jobDispatcher,
      coupon.shop.id,
      productIds,
      `coupon-${coupon.id}-start-${startAt}`,
      startAt - now,
    );
  }

  if (endAt > now) {
    await dispatchShopProjection(
      jobDispatcher,
      coupon.shop.id,
      productIds,
      `coupon-${coupon.id}-end-${endAt}`,
      endAt - now,
    );
  }
}

export async function dispatchShopProjection(
  jobDispatcher: JobDispatcher,
  shopId: string,
  productIds: string[] | undefined,
  bucket: string,
  delayMs?: number,
): Promise<void> {
  await jobDispatcher.dispatch(
    appJobName.projectShopCatalogProducts,
    {
      shopId,
      ...(productIds?.length ? { productIds } : {}),
    },
    {
      deduplicationKey: appJobDeduplicationKey.projectShopCatalogProducts(shopId, bucket),
      deduplicationMode: 'coalesce-latest',
      ...(delayMs && delayMs > 0 ? { delayMs } : {}),
    },
  );
}
