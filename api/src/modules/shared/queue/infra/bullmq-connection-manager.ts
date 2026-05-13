import {
  Inject,
  Injectable,
  OnApplicationShutdown
} from '@nestjs/common';
import type Redis from 'ioredis';
import { BULLMQ_CONNECTION } from './queue.constants';

@Injectable()
export class BullMqConnectionManager implements OnApplicationShutdown {
  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: Redis | null
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.connection) {
      await this.connection.quit();
    }
  }
}
