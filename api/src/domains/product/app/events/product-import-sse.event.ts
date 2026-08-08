export const PRODUCT_IMPORT_PROGRESS_SSE_EVENT = 'sse.product-import.progress';
export const PRODUCT_IMPORT_COMPLETED_SSE_EVENT = 'sse.product-import.completed';
export const PRODUCT_IMPORT_FAILED_SSE_EVENT = 'sse.product-import.failed';

export interface ProductImportProgressSseEventPayload {
  userId: string;
  importId: string;
  status: 'queued' | 'processing';
  processedRows: number;
  createdRows: number;
  failedRows: number;
  totalRows: number;
  filename: string;
  occurredAt?: string;
}

export interface ProductImportCompletedSseEventPayload {
  userId: string;
  importId: string;
  status: 'completed';
  processedRows: number;
  createdRows: number;
  failedRows: number;
  totalRows: number;
  filename: string;
  occurredAt?: string;
}

export interface ProductImportFailedSseEventPayload {
  userId: string;
  importId: string;
  status: 'failed';
  processedRows: number;
  createdRows: number;
  failedRows: number;
  totalRows: number;
  filename: string;
  message: string;
  occurredAt?: string;
}
