import {
  Inject,
  Injectable,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { BULLMQ_QUEUE } from './queue.constants';

@Injectable()
export class BullMqQueueManager implements OnApplicationShutdown {
  constructor(
    @Inject(BULLMQ_QUEUE) private readonly queue: Queue | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}
