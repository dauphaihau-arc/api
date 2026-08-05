export const ORDER_EXPORT_PROGRESS_SSE_EVENT = 'sse.order-export.progress';
export const ORDER_EXPORT_COMPLETED_SSE_EVENT = 'sse.order-export.completed';
export const ORDER_EXPORT_FAILED_SSE_EVENT = 'sse.order-export.failed';

export interface OrderExportProgressSseEventPayload {
  userId: string;
  exportId: string;
  status: 'queued' | 'processing';
  processedRows: number;
  totalRows: number;
  filename: string;
  occurredAt?: string;
}

export interface OrderExportCompletedSseEventPayload {
  userId: string;
  exportId: string;
  status: 'completed';
  processedRows: number;
  totalRows: number;
  filename: string;
  occurredAt?: string;
}

export interface OrderExportFailedSseEventPayload {
  userId: string;
  exportId: string;
  status: 'failed';
  message: string;
  filename: string;
  occurredAt?: string;
}
