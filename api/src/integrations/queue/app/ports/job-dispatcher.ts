import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions,
} from '~/integrations/queue/app/app-job.types';

export abstract class JobDispatcher {
  abstract dispatch<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName],
    options?: DispatchJobOptions
  ): Promise<void>;
}
