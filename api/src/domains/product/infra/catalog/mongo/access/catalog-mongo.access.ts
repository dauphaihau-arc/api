import {
  Inject,
  Injectable,
  OnApplicationShutdown,
} from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/platform/config/catalog.config';

type MongoDbLike = {
  collection(name: string): unknown;
};

type MongoClientLike = {
  connect(): Promise<void>;
  close(): Promise<void>;
  db(name: string): MongoDbLike;
};

@Injectable()
export class CatalogMongoAccess implements OnApplicationShutdown {
  private client?: MongoClientLike;
  private db?: MongoDbLike;

  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
  ) {}

  async ping(): Promise<void> {
    await this.getDb();
  }

  async getCollection<TCollection>(name: string): Promise<TCollection> {
    const db = await this.getDb();
    return db.collection(name) as TCollection;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.close();
  }

  private async getDb(): Promise<MongoDbLike> {
    if (!this.client) {
      this.client = await this.createMongoClient();
    }

    if (!this.db) {
      await this.client.connect();
      this.db = this.client.db(this.catalogConfig.mongodbDbName);
    }

    return this.db;
  }

  private async createMongoClient(): Promise<MongoClientLike> {
    const loadMongoDb = new Function(
      'return import("mongodb")',
    ) as () => Promise<{ MongoClient: new (uri: string) => MongoClientLike }>;
    const mongodb = await loadMongoDb();
    return new mongodb.MongoClient(this.catalogConfig.mongodbUri) as MongoClientLike;
  }
}
