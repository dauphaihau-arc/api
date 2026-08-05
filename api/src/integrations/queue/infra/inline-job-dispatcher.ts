import { Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions,
} from '~/platform/jobs/app-job.types';
import { JobRunner } from '~/platform/jobs/job-runner';
import type { JobDispatcher } from '../app/ports/job-dispatcher';

export class InlineJobDispatcher implements JobDispatcher {
  private readonly logger = new Logger(InlineJobDispatcher.name);

  constructor(private readonly moduleRef: ModuleRef) {}

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
        void this.runJob(name, payload).catch((error) => {
          this.logger.error(
            `Inline delayed job ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }, options.delayMs);
      timer.unref();
      return;
    }

    await this.runJob(name, payload);
  }

  private async runJob<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName],
  ): Promise<void> {
    await this.moduleRef.get(JobRunner, { strict: false }).run(name, payload);
  }
}
