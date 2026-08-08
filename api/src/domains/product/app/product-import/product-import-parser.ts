import * as XLSX from 'xlsx';
import { ProductWhoMade } from '../../domain/enums/product-who-made.enum';
import {
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_IMPORT_METADATA_SHEET,
  PRODUCT_IMPORT_PRODUCTS_SHEET,
  PRODUCT_IMPORT_REQUIRED_COLUMNS,
  PRODUCT_IMPORT_TEMPLATE_VERSION,
} from './product-import.constants';
import { ProductImportTemplateError } from './product-import.errors';

export interface ParsedProductImportRow {
  rowNumber: number;
  title?: string;
  description?: string;
  categoryPath?: string;
  price?: number;
  originalPrice?: number;
  stock?: number;
  sku?: string;
  isDigital?: boolean;
  whoMade?: ProductWhoMade;
  nonTaxable?: boolean;
  formulaColumns: string[];
  invalidColumns: string[];
}

export interface ParsedProductImportWorkbook {
  templateVersion: string;
  rows: ParsedProductImportRow[];
}

export function parseProductImportWorkbook(buffer: Buffer): ParsedProductImportWorkbook {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: true,
    cellDates: false,
  });

  const metadataSheet = workbook.Sheets[PRODUCT_IMPORT_METADATA_SHEET];
  if (!metadataSheet) {
    throw new ProductImportTemplateError('missing_metadata_sheet', 'Missing Metadata sheet');
  }

  assertNoFormulaCells(metadataSheet, 'metadata');

  const templateVersion = readMetadataValue(metadataSheet, 'template_version');
  if (templateVersion !== PRODUCT_IMPORT_TEMPLATE_VERSION) {
    throw new ProductImportTemplateError(
      'unsupported_template_version',
      `Unsupported template version "${templateVersion ?? ''}"`,
    );
  }

  const productsSheet = workbook.Sheets[PRODUCT_IMPORT_PRODUCTS_SHEET];
  if (!productsSheet) {
    throw new ProductImportTemplateError('missing_products_sheet', 'Missing Products sheet');
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(productsSheet, {
    header: 1,
    raw: true,
    defval: undefined,
    blankrows: false,
  });
  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map((value) => normalizeHeader(value));

  if (headers.length === 0 || headers.every((header) => !header)) {
    throw new ProductImportTemplateError('missing_headers', 'Products sheet is missing headers');
  }

  assertHeaderCellsHaveNoFormulas(productsSheet, headers.length);
  validateHeaders(headers);

  const rows = matrix
    .slice(1)
    .map((values, index) => parseRow(productsSheet, headers, values, index + 2))
    .filter((row) => hasAnyImportValue(row));

  if (rows.length > PRODUCT_IMPORT_MAX_ROWS) {
    throw new ProductImportTemplateError(
      'too_many_rows',
      `Product import supports at most ${PRODUCT_IMPORT_MAX_ROWS} rows`,
    );
  }

  return {
    templateVersion,
    rows,
  };
}


// ---------- Private helpers ----------

function readMetadataValue(sheet: XLSX.WorkSheet, key: string): string | undefined {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: undefined,
    blankrows: false,
  });

  for (const row of rows) {
    if (normalizeHeader(row[0]) === key) {
      return toOptionalString(row[1]);
    }
  }

  return undefined;
}

function validateHeaders(headers: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const header of headers.filter(Boolean)) {
    if (seen.has(header)) {
      duplicates.add(header);
    }
    seen.add(header);
  }

  if (duplicates.size > 0) {
    throw new ProductImportTemplateError(
      'duplicate_headers',
      `Duplicate headers: ${[...duplicates].join(', ')}`,
    );
  }

  const missing = PRODUCT_IMPORT_REQUIRED_COLUMNS.filter((column) => !seen.has(column));
  if (missing.length > 0) {
    throw new ProductImportTemplateError(
      'missing_required_headers',
      `Missing required headers: ${missing.join(', ')}`,
    );
  }
}

function assertNoFormulaCells(sheet: XLSX.WorkSheet, label: string) {
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) {
      continue;
    }

    const cell = sheet[address] as XLSX.CellObject | undefined;
    if (cell?.f) {
      throw new ProductImportTemplateError(
        'formula_in_template',
        `Formula cells are not supported in ${label}`,
      );
    }
  }
}

function assertHeaderCellsHaveNoFormulas(sheet: XLSX.WorkSheet, headerLength: number) {
  for (let columnIndex = 0; columnIndex < headerLength; columnIndex += 1) {
    // eslint-disable-next-line id-length -- SheetJS encode_cell uses r/c field names.
    const address = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    const cell = sheet[address] as XLSX.CellObject | undefined;
    if (cell?.f) {
      throw new ProductImportTemplateError(
        'formula_in_template',
        'Formula cells are not supported in Products headers',
      );
    }
  }
}

function parseRow(
  sheet: XLSX.WorkSheet,
  headers: string[],
  values: unknown[],
  rowNumber: number,
): ParsedProductImportRow {
  const rawByHeader = new Map<string, unknown>();
  const formulaColumns: string[] = [];
  const invalidColumns: string[] = [];

  headers.forEach((header, columnIndex) => {
    if (!header) {
      return;
    }

    rawByHeader.set(header, values[columnIndex]);
    // eslint-disable-next-line id-length -- SheetJS encode_cell uses r/c field names.
    const address = XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnIndex });
    const cell = sheet[address] as XLSX.CellObject | undefined;
    if (cell?.f) {
      formulaColumns.push(header);
    }
  });

  const isDigital = toOptionalBoolean(rawByHeader.get('is_digital'));
  const nonTaxable = toOptionalBoolean(rawByHeader.get('non_taxable'));
  const whoMade = toOptionalWhoMade(rawByHeader.get('who_made'));

  if (hasValue(rawByHeader.get('is_digital')) && isDigital === undefined) {
    invalidColumns.push('is_digital');
  }

  if (hasValue(rawByHeader.get('non_taxable')) && nonTaxable === undefined) {
    invalidColumns.push('non_taxable');
  }

  if (hasValue(rawByHeader.get('who_made')) && whoMade === undefined) {
    invalidColumns.push('who_made');
  }

  return {
    rowNumber,
    title: toOptionalString(rawByHeader.get('title')),
    description: toOptionalString(rawByHeader.get('description')),
    categoryPath: toOptionalString(rawByHeader.get('category_path')),
    price: toOptionalNumber(rawByHeader.get('price')),
    originalPrice: toOptionalNumber(rawByHeader.get('original_price')),
    stock: toOptionalInteger(rawByHeader.get('stock')),
    sku: toOptionalString(rawByHeader.get('sku')),
    isDigital,
    whoMade,
    nonTaxable,
    formulaColumns,
    invalidColumns,
  };
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function toOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return Number.NaN;
  }

  return Number(text);
}

function toOptionalInteger(value: unknown): number | undefined {
  const numberValue = toOptionalNumber(value);
  if (numberValue === undefined || Number.isNaN(numberValue)) {
    return numberValue;
  }

  return Number.isInteger(numberValue) ? numberValue : Number.NaN;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  const text = toOptionalString(value);
  if (!text) {
    return undefined;
  }

  switch (text.toLowerCase()) {
    case 'yes':
    case 'true':
      return true;
    case 'no':
    case 'false':
      return false;
    default:
      return undefined;
  }
}

function toOptionalWhoMade(value: unknown): ProductWhoMade | undefined {
  const text = toOptionalString(value);
  if (!text) {
    return undefined;
  }

  return Object.values(ProductWhoMade).includes(text as ProductWhoMade)
    ? text as ProductWhoMade
    : undefined;
}

function hasAnyImportValue(row: ParsedProductImportRow): boolean {
  return Boolean(
    row.title
    || row.description
    || row.categoryPath
    || row.price !== undefined
    || row.originalPrice !== undefined
    || row.stock !== undefined
    || row.sku
    || row.isDigital !== undefined
    || row.whoMade
    || row.nonTaxable !== undefined
    || row.formulaColumns.length > 0
    || row.invalidColumns.length > 0,
  );
}

function hasValue(value: unknown) {
  return toOptionalString(value) !== undefined;
}
