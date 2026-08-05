import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';

export const BEST_SELLER_RANKING_WINDOW_DAYS = 180;
export const BEST_SELLER_RANKING_REFRESH_LIMIT = 500;
export const BEST_SELLER_RANKING_REFRESH_DELAY_MS = 5000;

export async function dispatchBestSellerRankingRefresh(
  jobDispatcher: JobDispatcher,
): Promise<void> {
  await jobDispatcher.dispatch(
    appJobName.refreshBestSellerRankings,
    {
      windowDays: BEST_SELLER_RANKING_WINDOW_DAYS,
      limit: BEST_SELLER_RANKING_REFRESH_LIMIT,
    },
    {
      deduplicationKey: appJobDeduplicationKey.refreshBestSellerRankings(
        BEST_SELLER_RANKING_WINDOW_DAYS,
      ),
      delayMs: BEST_SELLER_RANKING_REFRESH_DELAY_MS,
    },
  );
}
