import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions
} from '../../../../../common/jobs/job.types';

export abstract class JobDispatcher {
  abstract dispatch<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName],
    options?: DispatchJobOptions
  ): Promise<void>;
}
