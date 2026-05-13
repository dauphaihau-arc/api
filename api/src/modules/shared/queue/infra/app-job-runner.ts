import { Injectable, Logger } from '@nestjs/common';
import {
  appJobName,
  AppJobName,
  AppJobPayloadMap
} from '../../../../common/jobs/job.types';
import { SendWelcomeEmailJob } from '../../../../common/jobs/send-welcome-email.job';

@Injectable()
export class AppJobRunner {
  private readonly logger = new Logger(AppJobRunner.name);

  constructor(private readonly sendWelcomeEmailJob: SendWelcomeEmailJob) {}

  async run<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName]
  ): Promise<void> {
    this.logger.log(`Running job ${name}`);

    switch (name) {
      case appJobName.sendWelcomeEmail:
        await this.sendWelcomeEmailJob.run(payload);
        return;
    }

    throw new Error(`Unsupported job name: ${String(name)}`);
  }
}
