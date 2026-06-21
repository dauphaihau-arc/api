import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import { ProductState } from '../../domain/enums/product-state.enum';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import {
  CatalogProductDocumentRepository,
  type CatalogProductDocumentStats,
} from '../ports/catalog-product-document.repository';

export interface CatalogStatus {
  driver: CatalogConfig['driver'];
  searchDriver: CatalogConfig['searchDriver'];
  enabled: boolean;
  source: {
    activeProducts: number;
  };
  projection: {
    totalDocuments?: number;
    activeDocuments?: number;
    latestUpdatedAt?: string;
    inSyncWithSource?: boolean;
    drift?: number;
  };
  store?: {
    dbName: string;
    productsCollection: string;
    slugsCollection: string;
    searchCollection: string;
  };
}

@Injectable()
export class CatalogStatusService {
  constructor(
    private readonly entityManager: EntityManager,
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogProductDocumentRepository: CatalogProductDocumentRepository,
  ) {}

  async getStatus(): Promise<CatalogStatus> {
    const activeProducts = await this.entityManager.fork().count(ProductEntity, {
      state: ProductState.ACTIVE,
    });

    if (this.catalogConfig.driver !== 'mongodb') {
      return {
        driver: this.catalogConfig.driver,
        searchDriver: this.catalogConfig.searchDriver,
        enabled: false,
        source: {
          activeProducts,
        },
        projection: {},
      };
    }

    const stats = await this.catalogProductDocumentRepository.getStats();

    return {
      driver: this.catalogConfig.driver,
      searchDriver: this.catalogConfig.searchDriver,
      enabled: true,
      source: {
        activeProducts,
      },
      projection: mapProjection(activeProducts, stats),
      store: {
        dbName: this.catalogConfig.mongodbDbName,
        productsCollection: this.catalogConfig.mongodbProductsCollection,
        slugsCollection: this.catalogConfig.mongodbSlugsCollection,
        searchCollection: this.catalogConfig.mongodbSearchCollection,
      },
    };
  }
}

function mapProjection(
  activeProducts: number,
  stats: CatalogProductDocumentStats | null,
): CatalogStatus['projection'] {
  if (!stats) {
    return {};
  }

  const drift = stats.activeDocuments - activeProducts;

  return {
    totalDocuments: stats.totalDocuments,
    activeDocuments: stats.activeDocuments,
    latestUpdatedAt: toIsoString(stats.latestUpdatedAt),
    inSyncWithSource: drift === 0,
    drift,
  };
}

function toIsoString(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
