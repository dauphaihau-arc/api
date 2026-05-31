import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { QUEUE_CONFIG } from '~/config/queue.config';
import type { QueueConfig } from '~/config/queue.config';
import { BULLMQ_CONNECTION } from '../queue/infra/queue.constants';
import { StorageService } from '../storage/app/ports/storage.service';

interface HealthComponent {
  status: 'ok' | 'error';
  details?: string;
}

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  components: {
    db: HealthComponent;
    storage: HealthComponent;
    redis?: HealthComponent;
    queue?: HealthComponent;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    @Inject(BULLMQ_CONNECTION) private readonly queueConnection: Redis | null
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [db, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
    ]);

    return {
      status: db.status === 'ok' && storage.status === 'ok' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      components: {
        db,
        storage,
      },
    };
  }

  async checkReadiness(): Promise<HealthCheckResult> {
    const [db, storage, redis, queue] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
      this.checkRedis(),
      this.checkQueue(),
    ]);

    const components = {
      db,
      storage,
      redis,
      queue,
    };

    return {
      status: Object.values(components).every((component) => component.status === 'ok')
        ? 'ok'
        : 'error',
      timestamp: new Date().toISOString(),
      components,
    };
  }

  private async checkDatabase(): Promise<HealthComponent> {
    try {
      await this.entityManager.getConnection().execute('select 1');

      return {
        status: 'ok',
      };
    }
    catch (error) {
      return {
        status: 'error',
        details: this.toErrorDetails(error),
      };
    }
  }

  private async checkStorage(): Promise<HealthComponent> {
    try {
      await this.storageService.ping();

      return {
        status: 'ok',
      };
    }
    catch (error) {
      return {
        status: 'error',
        details: this.toErrorDetails(error),
      };
    }
  }

  private async checkRedis(): Promise<HealthComponent> {
    if (this.queueConfig.driver !== 'redis') {
      return {
        status: 'ok',
        details: 'Queue driver is inline',
      };
    }

    if (!this.queueConnection) {
      return {
        status: 'error',
        details: 'BullMQ Redis connection is unavailable',
      };
    }

    try {
      await this.queueConnection.ping();

      return {
        status: 'ok',
      };
    }
    catch (error) {
      return {
        status: 'error',
        details: this.toErrorDetails(error),
      };
    }
  }

  private async checkQueue(): Promise<HealthComponent> {
    if (this.queueConfig.driver !== 'redis') {
      return {
        status: 'ok',
        details: 'Queue driver is inline',
      };
    }

    if (!this.queueConnection) {
      return {
        status: 'error',
        details: 'BullMQ Redis connection is unavailable',
      };
    }

    return {
      status: this.queueConnection.status === 'ready' ? 'ok' : 'error',
      ...(this.queueConnection.status === 'ready'
        ? {}
        : {
          details: `BullMQ Redis status is ${this.queueConnection.status}`,
        }),
    };
  }

  private toErrorDetails(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
