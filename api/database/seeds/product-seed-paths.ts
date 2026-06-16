import * as path from 'node:path';

const SEED_DATA_DIR = path.resolve(__dirname, '../../../seed-data');

export const PRODUCT_TSV_PATH = path.join(SEED_DATA_DIR, 'products.tsv');
export const PRODUCT_LOCAL_TSV_PATH = path.join(SEED_DATA_DIR, 'products.local.tsv');
export const PRODUCT_INVENTORY_TSV_PATH = path.join(SEED_DATA_DIR, 'product-inventory.tsv');
export const PRODUCT_INVENTORY_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'product-inventory.local.tsv'
);
export const PRODUCT_ATTRIBUTES_TSV_PATH = path.join(SEED_DATA_DIR, 'product-attributes.tsv');
export const PRODUCT_ATTRIBUTES_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'product-attributes.local.tsv'
);
export const PRODUCT_VIEW_HISTORY_TSV_PATH = path.join(SEED_DATA_DIR, 'product-view-history.tsv');
export const PRODUCT_VIEW_HISTORY_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'product-view-history.local.tsv'
);
export const EXCHANGE_RATES_TSV_PATH = path.join(SEED_DATA_DIR, 'exchange-rates.tsv');
export const EXCHANGE_RATES_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'exchange-rates.local.tsv'
);
export const SHOPS_TSV_PATH = path.join(SEED_DATA_DIR, 'shops.tsv');
export const SHOPS_LOCAL_TSV_PATH = path.join(SEED_DATA_DIR, 'shops.local.tsv');

export const PRODUCT_IMAGE_ROOT_DIRS = [
  path.join(SEED_DATA_DIR, 'images', 'products-local'),
  path.join(SEED_DATA_DIR, 'images', 'products'),
];
