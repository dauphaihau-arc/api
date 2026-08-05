import type { AppJobName, AppJobPayloadMap } from './app-job.types';

export abstract class JobRunner {
  abstract run<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName]
  ): Promise<void>;
}
