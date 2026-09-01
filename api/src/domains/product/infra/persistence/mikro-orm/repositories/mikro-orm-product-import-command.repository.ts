import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import {
  type CompleteProductImportInput,
  type CreateProductImportInput,
  ProductImportCommandRepository,
} from '../../../../app/ports/product-import-command.repository';
import type { ProductImportSummary } from '../../../../app/ports/product-import.types';
import { ProductImportRowStatus } from '../../../../domain/enums/product-import-row-status.enum';
import { ProductImportStatus } from '../../../../domain/enums/product-import-status.enum';
import { ProductImportEntity } from '../entities/product-import.entity';
import { ProductImportRowEntity } from '../entities/product-import-row.entity';
import { ProductEntity } from '../entities/product.entity';

@Injectable()
export class MikroOrmProductImportCommandRepository implements ProductImportCommandRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async createQueued(input: CreateProductImportInput): Promise<ProductImportSummary> {
    const entityManager = this.entityManager.fork();
    const productImport = new ProductImportEntity();

    productImport.shop = entityManager.getReference(ShopEntity, input.shopId);
    productImport.requestedBy = entityManager.getReference(UserEntity, input.requestedByUserId);
    productImport.status = ProductImportStatus.QUEUED;
    productImport.templateVersion = input.templateVersion;
    productImport.filename = input.filename;
    productImport.sourceFileStorageKey = input.sourceFileStorageKey;
    productImport.totalRows = input.totalRows;
    productImport.processedRows = 0;
    productImport.createdRows = 0;
    productImport.failedRows = 0;
    productImport.sourceExpiresAt = input.sourceExpiresAt;
    productImport.reportExpiresAt = input.reportExpiresAt;

    for (const row of input.rows) {
      const rowEntity = new ProductImportRowEntity();
      rowEntity.productImport = productImport;
      rowEntity.rowNumber = row.rowNumber;
      rowEntity.status = ProductImportRowStatus.PENDING;
      rowEntity.rowJson = row.rowJson;
      rowEntity.sku = row.sku;
      rowEntity.title = row.title;
      productImport.rows.add(rowEntity);
    }

    await entityManager.persist(productImport).flush();

    return toProductImportSummary(productImport);
  }

  async markProcessing(importId: string): Promise<ProductImportSummary | undefined> {
    const entityManager = this.entityManager.fork();
    const productImport = await entityManager.findOne(
      ProductImportEntity,
      importId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!productImport) {
      return undefined;
    }

    productImport.status = ProductImportStatus.PROCESSING;
    productImport.errorMessage = undefined;
    await entityManager.flush();

    return toProductImportSummary(productImport);
  }

  async markRowCreated(importId: string, rowNumber: number, productId: string): Promise<void> {
    const entityManager = this.entityManager.fork();
    const row = await entityManager.findOne(
      ProductImportRowEntity,
      { productImport: importId, rowNumber },
    );

    if (!row || row.status === ProductImportRowStatus.CREATED) {
      return;
    }

    row.status = ProductImportRowStatus.CREATED;
    row.product = entityManager.getReference(ProductEntity, productId);
    row.errorCode = undefined;
    row.errorMessage = undefined;
    await entityManager.flush();
  }

  async markRowFailed(
    importId: string,
    rowNumber: number,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const entityManager = this.entityManager.fork();
    const row = await entityManager.findOne(
      ProductImportRowEntity,
      { productImport: importId, rowNumber },
    );

    if (!row || row.status === ProductImportRowStatus.CREATED) {
      return;
    }

    row.status = ProductImportRowStatus.FAILED;
    row.errorCode = errorCode;
    row.errorMessage = errorMessage;
    await entityManager.flush();
  }

  async syncProgress(importId: string): Promise<ProductImportSummary | undefined> {
    const entityManager = this.entityManager.fork();
    const productImport = await entityManager.findOne(
      ProductImportEntity,
      importId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!productImport) {
      return undefined;
    }

    const rowRepository = entityManager.getRepository(ProductImportRowEntity);
    const [createdRows, failedRows] = await Promise.all([
      rowRepository.count({ productImport, status: ProductImportRowStatus.CREATED }),
      rowRepository.count({ productImport, status: ProductImportRowStatus.FAILED }),
    ]);

    productImport.createdRows = createdRows;
    productImport.failedRows = failedRows;
    productImport.processedRows = createdRows + failedRows;
    await entityManager.flush();

    return toProductImportSummary(productImport);
  }

  async markCompleted(input: CompleteProductImportInput): Promise<ProductImportSummary | undefined> {
    const entityManager = this.entityManager.fork();
    const productImport = await entityManager.findOne(
      ProductImportEntity,
      input.importId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!productImport) {
      return undefined;
    }

    productImport.status = ProductImportStatus.COMPLETED;
    productImport.reportFileStorageKey = input.reportFileStorageKey;
    productImport.processedRows = input.processedRows;
    productImport.createdRows = input.createdRows;
    productImport.failedRows = input.failedRows;
    productImport.completedAt = input.completedAt;
    await entityManager.flush();

    return toProductImportSummary(productImport);
  }

  async markFailed(
    importId: string,
    errorMessage: string,
    reportFileStorageKey?: string,
  ): Promise<ProductImportSummary | undefined> {
    const entityManager = this.entityManager.fork();
    const productImport = await entityManager.findOne(
      ProductImportEntity,
      importId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!productImport) {
      return undefined;
    }

    productImport.status = ProductImportStatus.FAILED;
    productImport.errorMessage = errorMessage;
    productImport.reportFileStorageKey = reportFileStorageKey;
    await entityManager.flush();

    return toProductImportSummary(productImport);
  }
}

function toProductImportSummary(productImport: ProductImportEntity): ProductImportSummary {
  return {
    id: productImport.id,
    shopId: productImport.shop.id,
    requestedByUserId: productImport.requestedBy.id,
    status: productImport.status,
    templateVersion: productImport.templateVersion,
    filename: productImport.filename,
    sourceFileStorageKey: productImport.sourceFileStorageKey,
    reportFileStorageKey: productImport.reportFileStorageKey,
    totalRows: productImport.totalRows,
    processedRows: productImport.processedRows,
    createdRows: productImport.createdRows,
    failedRows: productImport.failedRows,
    errorMessage: productImport.errorMessage,
    completedAt: productImport.completedAt,
    sourceExpiresAt: productImport.sourceExpiresAt,
    reportExpiresAt: productImport.reportExpiresAt,
    createdAt: productImport.createdAt,
    updatedAt: productImport.updatedAt,
  };
}
