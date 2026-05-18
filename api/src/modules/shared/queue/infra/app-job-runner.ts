import { Injectable, Logger } from '@nestjs/common';
import {
  appJobName,
  AppJobName,
  AppJobPayloadMap
} from '../../../../common/jobs/job.types';
import { SendPasswordResetEmailJob } from '../../../../common/jobs/send-password-reset-email.job';
import { SendWelcomeEmailJob } from '../../../../common/jobs/send-welcome-email.job';

@Injectable()
export class AppJobRunner {
  private readonly logger = new Logger(AppJobRunner.name);

  constructor(
    private readonly sendWelcomeEmailJob: SendWelcomeEmailJob,
    private readonly sendPasswordResetEmailJob: SendPasswordResetEmailJob
  ) {}

  async run<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName]
  ): Promise<void> {
    this.logger.log(`Running job ${name}`);
    this.logger.debug(`Job payload for ${name}: ${JSON.stringify(payload)}`);

    switch (name) {
      case appJobName.sendWelcomeEmail:
        await this.sendWelcomeEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendWelcomeEmail]
        );
        return;
      case appJobName.sendPasswordResetEmail:
        await this.sendPasswordResetEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendPasswordResetEmail]
        );
        return;
    }

    throw new Error(`Unsupported job name: ${String(name)}`);
  }
}
