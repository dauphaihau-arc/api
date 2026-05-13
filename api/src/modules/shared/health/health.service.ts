import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
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
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService
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

  private toErrorDetails(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
