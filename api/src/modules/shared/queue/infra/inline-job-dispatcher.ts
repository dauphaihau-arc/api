import { Logger } from '@nestjs/common';
import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions,
} from '~/common/jobs/job.types';
import type { JobDispatcher } from '../app/ports/job-dispatcher';
import type { AppJobRunner } from './app-job-runner';

export class InlineJobDispatcher implements JobDispatcher {
  private readonly logger = new Logger(InlineJobDispatcher.name);

  constructor(private readonly appJobRunner: AppJobRunner) {}

  async dispatch<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName],
    options?: DispatchJobOptions,
  ): Promise<void> {
    this.logger.log(
      `Running inline job ${name}${options?.deduplicationKey ? ` (${options.deduplicationKey})` : ''}`,
    );

    if (options?.delayMs && options.delayMs > 0) {
      const timer = setTimeout(() => {
        void this.appJobRunner.run(name, payload).catch((error) => {
          this.logger.error(
            `Inline delayed job ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }, options.delayMs);
      timer.unref();
      return;
    }

    await this.appJobRunner.run(name, payload);
  }
}
