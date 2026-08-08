import type { ProductImportSummary } from '~/domains/product/app/ports/product-import.types';

export interface ShopProductImportResponse {
  id: string;
  status: string;
  filename: string;
  template_version: string;
  total_rows: number;
  processed_rows: number;
  created_rows: number;
  failed_rows: number;
  unprocessed_rows: number;
  error_message?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export function toShopProductImportResponse(
  productImport: ProductImportSummary,
): ShopProductImportResponse {
  return {
    id: productImport.id,
    status: productImport.status,
    filename: productImport.filename,
    template_version: productImport.templateVersion,
    total_rows: productImport.totalRows,
    processed_rows: productImport.processedRows,
    created_rows: productImport.createdRows,
    failed_rows: productImport.failedRows,
    unprocessed_rows: Math.max(productImport.totalRows - productImport.processedRows, 0),
    error_message: productImport.errorMessage,
    completed_at: productImport.completedAt?.toISOString(),
    created_at: productImport.createdAt.toISOString(),
    updated_at: productImport.updatedAt.toISOString(),
  };
}
