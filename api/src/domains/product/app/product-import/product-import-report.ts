import type { ProductImportRowResult } from '../ports/product-import.types';

export function buildProductImportReportCsv(rows: ProductImportRowResult[]): string {
  const header = [
    'row_number',
    'status',
    'product_id',
    'sku',
    'title',
    'error_code',
    'error_message',
  ];
  const body = rows
    .sort((left, right) => left.rowNumber - right.rowNumber)
    .map((row) => [
      row.rowNumber,
      row.status,
      row.productId ?? '',
      row.sku ?? '',
      row.title ?? '',
      row.errorCode ?? '',
      row.errorMessage ?? '',
    ]);

  return [header, ...body].map((row) => row.map(toCsvCell).join(',')).join('\r\n');
}

function toCsvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${safeText.replace(/"/g, '""')}"`;
}
