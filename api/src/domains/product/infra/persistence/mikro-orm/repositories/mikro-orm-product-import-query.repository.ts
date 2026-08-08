import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductImportQueryRepository } from '../../../../app/ports/product-import-query.repository';
import type {
  ProductImportRowResult,
  ProductImportSummary,
} from '../../../../app/ports/product-import.types';
import { ProductImportEntity } from '../entities/product-import.entity';
import { ProductImportRowEntity } from '../entities/product-import-row.entity';

@Injectable()
export class MikroOrmProductImportQueryRepository implements ProductImportQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findByShopId(shopId: string, importId: string): Promise<ProductImportSummary | undefined> {
    const productImport = await this.entityManager.fork().findOne(
      ProductImportEntity,
      { id: importId, shop: shopId },
      { populate: ['shop', 'requestedBy'] },
    );

    return productImport ? toProductImportSummary(productImport) : undefined;
  }

  async findForProcessing(importId: string): Promise<ProductImportSummary | undefined> {
    const productImport = await this.entityManager.fork().findOne(
      ProductImportEntity,
      importId,
      { populate: ['shop', 'requestedBy'] },
    );

    return productImport ? toProductImportSummary(productImport) : undefined;
  }

  async listRows(importId: string): Promise<ProductImportRowResult[]> {
    const rows = await this.entityManager.fork().find(
      ProductImportRowEntity,
      { productImport: importId },
      { populate: ['product'], orderBy: { rowNumber: 'asc' } },
    );

    return rows.map(toProductImportRowResult);
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

function toProductImportRowResult(row: ProductImportRowEntity): ProductImportRowResult {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    status: row.status,
    rowJson: row.rowJson,
    productId: row.product?.id,
    sku: row.sku,
    title: row.title,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}
