import type { OrderExportStatus } from '../../domain/enums/order-export-status.enum';

export interface ShopOrderExportSummary {
  id: string;
  shopId: string;
  requestedByUserId: string;
  status: OrderExportStatus;
  filtersJson: Record<string, unknown>;
  columnsJson: string[];
  timezone: string;
  filename: string;
  totalRows?: number;
  processedRows: number;
  fileStorageKey?: string;
  errorMessage?: string;
  completedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateQueuedShopOrderExportInput {
  shopId: string;
  requestedByUserId: string;
  filtersJson: Record<string, unknown>;
  columnsJson: string[];
  timezone: string;
  filename: string;
  totalRows: number;
  expiresAt: Date;
}

export interface CompleteShopOrderExportInput {
  exportId: string;
  processedRows: number;
  fileStorageKey: string;
  completedAt: Date;
}

export abstract class ShopOrderExportRepository {
  abstract createQueued(
    input: CreateQueuedShopOrderExportInput,
  ): Promise<ShopOrderExportSummary>;

  abstract findByShopId(
    shopId: string,
    exportId: string,
  ): Promise<ShopOrderExportSummary | undefined>;

  abstract findForProcessing(
    exportId: string,
  ): Promise<ShopOrderExportSummary | undefined>;

  abstract markProcessing(
    exportId: string,
  ): Promise<ShopOrderExportSummary | undefined>;

  abstract updateProgress(
    exportId: string,
    processedRows: number,
  ): Promise<ShopOrderExportSummary | undefined>;

  abstract markCompleted(
    input: CompleteShopOrderExportInput,
  ): Promise<ShopOrderExportSummary | undefined>;

  abstract markFailed(
    exportId: string,
    errorMessage: string,
  ): Promise<ShopOrderExportSummary | undefined>;
}
