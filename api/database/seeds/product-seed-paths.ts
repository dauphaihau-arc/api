import * as path from 'node:path';

const SEED_DATA_DIR = path.resolve(__dirname, '../../../seed-data');

export const PRODUCT_TSV_PATH = path.join(SEED_DATA_DIR, 'products.tsv');
export const PRODUCT_LOCAL_TSV_PATH = path.join(SEED_DATA_DIR, 'products.local.tsv');
export const PRODUCT_INVENTORY_TSV_PATH = path.join(SEED_DATA_DIR, 'product-inventory.tsv');
export const PRODUCT_INVENTORY_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'product-inventory.local.tsv',
);
export const PRODUCT_ATTRIBUTES_TSV_PATH = path.join(SEED_DATA_DIR, 'product-attributes.tsv');
export const PRODUCT_ATTRIBUTES_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'product-attributes.local.tsv',
);
export const PRODUCT_VIEW_HISTORY_TSV_PATH = path.join(SEED_DATA_DIR, 'product-view-history.tsv');
export const PRODUCT_VIEW_HISTORY_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'product-view-history.local.tsv',
);
export const PRODUCT_REVIEWS_TSV_PATH = path.join(SEED_DATA_DIR, 'product-reviews.tsv');
export const PRODUCT_REVIEWS_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'product-reviews.local.tsv',
);
export const ORDER_SCENARIOS_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'order-scenarios.local.tsv',
);
export const CHAT_CONVERSATIONS_TSV_PATH = path.join(SEED_DATA_DIR, 'chat-conversations.tsv');
export const CHAT_CONVERSATIONS_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'chat-conversations.local.tsv',
);
export const CHAT_MESSAGES_TSV_PATH = path.join(SEED_DATA_DIR, 'chat-messages.tsv');
export const CHAT_MESSAGES_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'chat-messages.local.tsv',
);
export const USER_ADDRESSES_TSV_PATH = path.join(SEED_DATA_DIR, 'user-addresses.tsv');
export const USER_ADDRESSES_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'user-addresses.local.tsv',
);
export const USER_PREFERENCES_TSV_PATH = path.join(SEED_DATA_DIR, 'user-preferences.tsv');
export const USER_PREFERENCES_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'user-preferences.local.tsv',
);
export const EXCHANGE_RATES_TSV_PATH = path.join(SEED_DATA_DIR, 'exchange-rates.tsv');
export const EXCHANGE_RATES_LOCAL_TSV_PATH = path.join(
  SEED_DATA_DIR,
  'exchange-rates.local.tsv',
);
export const SHOPS_TSV_PATH = path.join(SEED_DATA_DIR, 'shops.tsv');
export const SHOPS_LOCAL_TSV_PATH = path.join(SEED_DATA_DIR, 'shops.local.tsv');

export const PRODUCT_IMAGE_ROOT_DIRS = [
  path.join(SEED_DATA_DIR, 'images', 'products-local'),
  path.join(SEED_DATA_DIR, 'images', 'products'),
];

export const REVIEW_IMAGE_ROOT_DIRS = [
  path.join(SEED_DATA_DIR, 'images', 'reviews-local'),
  path.join(SEED_DATA_DIR, 'images', 'reviews'),
];
