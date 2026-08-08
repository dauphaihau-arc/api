import type { ProductImportRowStatus } from '../../domain/enums/product-import-row-status.enum';
import type { ProductImportStatus } from '../../domain/enums/product-import-status.enum';

export interface ProductImportRowSnapshot {
  rowNumber: number;
  rowJson: Record<string, unknown>;
  sku?: string;
  title?: string;
}

export interface ProductImportRowResult {
  id: string;
  rowNumber: number;
  status: ProductImportRowStatus;
  rowJson: Record<string, unknown>;
  productId?: string;
  sku?: string;
  title?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProductImportSummary {
  id: string;
  shopId: string;
  requestedByUserId: string;
  status: ProductImportStatus;
  templateVersion: string;
  filename: string;
  sourceFileStorageKey: string;
  reportFileStorageKey?: string;
  totalRows: number;
  processedRows: number;
  createdRows: number;
  failedRows: number;
  errorMessage?: string;
  completedAt?: Date;
  sourceExpiresAt: Date;
  reportExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedImportCategory {
  id: string;
  path: string;
}
