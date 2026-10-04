import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';

interface ProjectableSale {
  id: string;
  shop: { id: string };
  applicationKind: PromotionApplicationKind;
  productScope: PromotionProductScope;
  products: { getItems(): Array<{ productId: string }> };
  benefitType: PromotionBenefitType;
  percentOff?: number | null | undefined;
  startAt: Date;
  endAt: Date;
  cancelledAt?: Date | null | undefined;
  endedAt?: Date | null | undefined;
}

export async function scheduleShopPromotionCatalogProjection(
  jobDispatcher: JobDispatcher,
  sale: ProjectableSale,
): Promise<void> {
  if (
    sale.applicationKind !== PromotionApplicationKind.SALE
    || sale.benefitType !== PromotionBenefitType.PERCENTAGE
    || !sale.percentOff
    || sale.percentOff <= 0
    || sale.cancelledAt != null
    || sale.endedAt != null
  ) {
    return;
  }

  const now = Date.now();
  const startAt = sale.startAt.getTime();
  const endAt = sale.endAt.getTime();

  const productIds = sale.productScope === PromotionProductScope.SPECIFIC
    ? sale.products.getItems().map((entry) => entry.productId)
    : undefined;

  if (startAt <= now && endAt >= now) {
    await dispatchShopProjection(jobDispatcher, sale.shop.id, productIds, `sale-${sale.id}-now`);
  }

  if (startAt > now) {
    await dispatchShopProjection(
      jobDispatcher,
      sale.shop.id,
      productIds,
      `sale-${sale.id}-start-${startAt}`,
      startAt - now,
    );
  }

  if (endAt > now) {
    await dispatchShopProjection(
      jobDispatcher,
      sale.shop.id,
      productIds,
      `sale-${sale.id}-end-${endAt}`,
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
