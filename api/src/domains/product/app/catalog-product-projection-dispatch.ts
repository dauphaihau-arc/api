import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';

export async function dispatchCatalogProductProjections(
  jobDispatcher: JobDispatcher,
  productIds: string[],
): Promise<void> {
  const seenProductIds = new Set<string>();

  const uniqueProductIds = productIds.filter((productId) => {
    if (seenProductIds.has(productId)) {
      return false;
    }

    seenProductIds.add(productId);
    return true;
  });

  await Promise.all(uniqueProductIds.map((productId) =>
    jobDispatcher.dispatch(
      appJobName.projectCatalogProduct,
      { productId },
      {
        deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(productId),
        deduplicationMode: 'coalesce-latest',
      },
    )));
}
