import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/platform/config/catalog.config';
import type Redis from 'ioredis';
import { CatalogProductDocumentRepository } from '~/domains/product/app/ports/catalog-product-document.repository';
import { CatalogProductPriceDocumentRepository } from '~/domains/product/app/ports/catalog-product-price-document.repository';
import { CatalogSearchDocumentRepository } from '~/domains/product/app/ports/catalog-search-document.repository';
import { CatalogProductSlugRepository } from '~/domains/product/app/ports/catalog-product-slug.repository';
import { QUEUE_CONFIG } from '~/platform/config/queue.config';
import type { QueueConfig } from '~/platform/config/queue.config';
import { BULLMQ_CONNECTION } from '~/integrations/queue/infra/queue.constants';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';

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
    catalog: HealthComponent;
    redis?: HealthComponent;
    queue?: HealthComponent;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    private readonly catalogProductDocumentRepository: CatalogProductDocumentRepository,
    private readonly catalogProductPriceDocumentRepository: CatalogProductPriceDocumentRepository,
    private readonly catalogProductSlugRepository: CatalogProductSlugRepository,
    private readonly catalogSearchDocumentRepository: CatalogSearchDocumentRepository,
    @Inject(CATALOG_CONFIG) private readonly catalogConfig: CatalogConfig,
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    @Inject(BULLMQ_CONNECTION) private readonly queueConnection: Redis | null,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [db, storage, catalog] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
      this.checkCatalog(),
    ]);

    return {
      status: db.status === 'ok' && storage.status === 'ok' && catalog.status === 'ok'
        ? 'ok'
        : 'error',
      timestamp: new Date().toISOString(),
      components: {
        db,
        storage,
        catalog,
      },
    };
  }

  async checkReadiness(): Promise<HealthCheckResult> {
    const [db, storage, catalog, redis, queue] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
      this.checkCatalog(),
      this.checkRedis(),
      this.checkQueue(),
    ]);

    const components = {
      db,
      storage,
      catalog,
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

  private async checkCatalog(): Promise<HealthComponent> {
    if (this.catalogConfig.driver !== 'mongodb') {
      return {
        status: 'ok',
        details: 'Catalog driver is postgres',
      };
    }

    try {
      await Promise.all([
        this.catalogProductDocumentRepository.ping(),
        this.catalogProductPriceDocumentRepository.ping(),
        this.catalogProductSlugRepository.ping(),
        this.catalogSearchDocumentRepository.ping(),
      ]);

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
