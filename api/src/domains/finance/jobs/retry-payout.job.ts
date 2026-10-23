import { Injectable } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { RetryPayoutUseCase } from '../app/use-cases/retry-payout/retry-payout.use-case';

type RetryPayoutPayload = AppJobPayloadMap['payout.retry'];

/**
 * The delayed retry of one claimed Payout. The job carries only the Payout id;
 * the claim itself holds what the attempt must settle.
 */
@Injectable()
export class RetryPayoutJob {
  constructor(private readonly retryPayoutUseCase: RetryPayoutUseCase) {}

  async run(payload: RetryPayoutPayload): Promise<void> {
    await this.retryPayoutUseCase.execute(payload.payoutId);
  }
}
