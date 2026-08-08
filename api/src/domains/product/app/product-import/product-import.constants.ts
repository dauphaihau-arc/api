export const PRODUCT_IMPORT_TEMPLATE_VERSION = 'product-import-v1';
export const PRODUCT_IMPORT_PRODUCTS_SHEET = 'Products';
export const PRODUCT_IMPORT_METADATA_SHEET = 'Metadata';
export const PRODUCT_IMPORT_INSTRUCTIONS_SHEET = 'Instructions';
export const PRODUCT_IMPORT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ROWS = 1_000;
export const PRODUCT_IMPORT_PREVIEW_ROWS = 10;

export const PRODUCT_IMPORT_REQUIRED_COLUMNS = [
  'title',
  'description',
  'category_path',
  'price',
  'stock',
] as const;

export const PRODUCT_IMPORT_OPTIONAL_COLUMNS = [
  'sku',
  'original_price',
  'is_digital',
  'who_made',
  'non_taxable',
] as const;

export const PRODUCT_IMPORT_COLUMNS = [
  ...PRODUCT_IMPORT_REQUIRED_COLUMNS,
  ...PRODUCT_IMPORT_OPTIONAL_COLUMNS,
] as const;

export const PRODUCT_IMPORT_SOURCE_RETENTION_DAYS = 7;
export const PRODUCT_IMPORT_REPORT_RETENTION_DAYS = 30;
