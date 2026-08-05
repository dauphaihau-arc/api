import type { ShopOrderExportSummary } from '../../app/ports/shop-order-export.repository';

export function toShopOrderExportResponse(orderExport: ShopOrderExportSummary) {
  return {
    id: orderExport.id,
    status: orderExport.status,
    filename: orderExport.filename,
    total_rows: orderExport.totalRows ?? 0,
    processed_rows: orderExport.processedRows,
    percent: calculatePercent(orderExport.processedRows, orderExport.totalRows ?? 0, orderExport.status),
    error_message: orderExport.errorMessage,
    completed_at: orderExport.completedAt,
    expires_at: orderExport.expiresAt,
    created_at: orderExport.createdAt,
    updated_at: orderExport.updatedAt,
  };
}

function calculatePercent(
  processedRows: number,
  totalRows: number,
  status: string,
) {
  if (status === 'completed') {
    return 100;
  }

  if (totalRows <= 0) {
    return 0;
  }

  return Math.min(99, Math.floor((processedRows / totalRows) * 100));
}
