import type { ShopOrderExportRow } from '../../ports/shop-order-export-query.repository';
import type { ExportColumn } from './shop-order-export-columns';

export function buildShopOrderCsv(
  columns: ExportColumn[],
  rows: ShopOrderExportRow[],
) {
  return [
    buildShopOrderCsvHeader(columns),
    buildShopOrderCsvRows(columns, rows),
  ].filter(Boolean).join('\r\n');
}

export function buildShopOrderCsvHeader(columns: ExportColumn[]) {
  return columns.map(column => column.label).map(escapeCsvCell).join(',');
}

export function buildShopOrderCsvRows(
  columns: ExportColumn[],
  rows: ShopOrderExportRow[],
) {
  const csvRows = [
    ...rows.map(row => columns.map(column => normalizeCell(column.read(row)))),
  ];

  return csvRows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

function normalizeCell(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function escapeCsvCell(value: string) {
  const spreadsheetSafeValue = /^[=+\-@\t\r]/.test(value)
    ? `'${value}`
    : value;

  return `"${spreadsheetSafeValue.replace(/"/g, '""')}"`;
}
