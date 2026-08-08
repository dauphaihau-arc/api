import type {
  ProductImportRowSnapshot,
  ProductImportSummary,
} from './product-import.types';

export interface CreateProductImportInput {
  shopId: string;
  requestedByUserId: string;
  templateVersion: string;
  filename: string;
  sourceFileStorageKey: string;
  totalRows: number;
  sourceExpiresAt: Date;
  reportExpiresAt: Date;
  rows: ProductImportRowSnapshot[];
}

export interface CompleteProductImportInput {
  importId: string;
  reportFileStorageKey: string;
  processedRows: number;
  createdRows: number;
  failedRows: number;
  completedAt: Date;
}

export abstract class ProductImportCommandRepository {
  abstract createQueued(input: CreateProductImportInput): Promise<ProductImportSummary>;
  abstract markProcessing(importId: string): Promise<ProductImportSummary | undefined>;
  abstract markRowCreated(importId: string, rowNumber: number, productId: string): Promise<void>;
  abstract markRowFailed(importId: string, rowNumber: number, errorCode: string, errorMessage: string): Promise<void>;
  abstract syncProgress(importId: string): Promise<ProductImportSummary | undefined>;
  abstract markCompleted(input: CompleteProductImportInput): Promise<ProductImportSummary | undefined>;
  abstract markFailed(
    importId: string,
    errorMessage: string,
    reportFileStorageKey?: string,
  ): Promise<ProductImportSummary | undefined>;
}
