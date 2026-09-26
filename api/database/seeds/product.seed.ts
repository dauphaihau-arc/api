import type { EntityManager } from '@mikro-orm/postgresql';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import * as path from 'node:path';
import { CategoryAttributeEntity } from '~/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductImageVariantStatus } from '~/domains/product/domain/enums/product-image-variant-status.enum';
import { ProductVariantLifecycleState } from '~/domains/product/domain/enums/product-variant-lifecycle-state.enum';
import type { MarketplaceCurrency } from '~/platform/config/marketplace.config';
import {
  buildStorageObjectKey,
  resolveStorageEnvironmentSegment,
} from '~/integrations/storage/app/storage-key-builder';
import { ProductAttributeValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductOptionEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option.entity';
import { ProductOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option-value.entity';
import { ProductVariantOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant-option-value.entity';
import { ProductInventoryEntity, ProductInventoryLifecycleState } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  DEFAULT_SELLER_STOCK_POOL_NAME,
  ProductStockPoolCustody,
  ProductStockPoolEntity,
  ProductStockPoolLifecycleState,
} from '~/domains/product/infra/persistence/mikro-orm/entities/product-stock-pool.entity';
import { VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { VARIANT_PRICE_TYPES } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ShippingDestinationScope } from '~/domains/shipping/domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import { ShippingProfileEntity } from '~/domains/shipping/infra/persistence/entities/shipping-profile.entity';
import { ShippingProfileRateEntity } from '~/domains/shipping/infra/persistence/entities/shipping-profile-rate.entity';
import { productSeeds, type ProductSeed } from './product.seed-loader';
import { PRODUCT_IMAGE_ROOT_DIRS } from './product-seed-paths';
import {
  resolveOptionalSeedProductImagePaths,
  resolveSeedProductImagePaths,
  slugifySeedValue,
} from './product-seed-image-resolver';

function slugify(value: string): string {
  return slugifySeedValue(value);
}

function hashSeed(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickDeterministicValue<T>(seed: string, values: readonly T[]): T {
  return values[hashSeed(seed) % values.length];
}

const CURRENCY_DECIMALS: Record<MarketplaceCurrency, number> = {
  USD: 2,
  AUD: 2,
  BRL: 2,
  CHF: 2,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  JPY: 0,
  KRW: 0,
  MAD: 2,
  MXN: 2,
  MYR: 2,
  NOK: 2,
  NZD: 2,
  PHP: 2,
  PLN: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TRY: 2,
  TWD: 2,
  VND: 0,
  ZAR: 2,
};

function toMinorUnits(amount: number, currency: MarketplaceCurrency): number {
  const decimals = CURRENCY_DECIMALS[currency];
  return Math.round(amount * (10 ** decimals));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function deterministicSeedUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function buildSeedSelectionKey(selections: Record<string, string>): string {
  return Object.keys(selections)
    .sort()
    .map((optionKey) => `${optionKey}:${selections[optionKey]}`)
    .join('|') || '__default__';
}

function buildProductOptionCombinationKey(valueIds: string[]): string {
  return valueIds.slice().sort().join('|') || '__default__';
}

function normalizeProductOptionLabel(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

async function findCategoryByPath(
  em: EntityManager,
  categoryPath: string[],
  cache: Map<string, CategoryEntity>,
): Promise<CategoryEntity> {
  const cacheKey = categoryPath.join(' > ');
  const cachedCategory = cache.get(cacheKey);

  if (cachedCategory) {
    return cachedCategory;
  }

  let parent: CategoryEntity | null = null;
  let category: CategoryEntity | null = null;

  for (const name of categoryPath) {
    category = await em.findOne(CategoryEntity, { name, parent: parent ?? null });
    if (!category) {
      throw new Error(`Missing seeded category path: ${categoryPath.join(' > ')}`);
    }
    parent = category;
  }

  if (!category) {
    throw new Error(`Missing seeded category path: ${categoryPath.join(' > ')}`);
  }

  cache.set(cacheKey, category);
  return category;
}

async function syncProductImages(
  em: EntityManager,
  shop: ShopEntity,
  product: ProductEntity,
  imageFilenames: string[],
): Promise<void> {
  await em.nativeDelete(ProductImageEntity, { product: product.id });

  imageFilenames.forEach((imageFilename, index) => {
    const normalizedFilename = basename(imageFilename.trim());
    const extension = extname(normalizedFilename).replace(/^\./, '').toLowerCase();
    const filenameWithoutExtension = normalizedFilename.slice(
      0,
      normalizedFilename.length - extension.length - 1,
    );

    if (!extension || !filenameWithoutExtension) {
      throw new Error(`Invalid product image filename "${imageFilename}".`);
    }

    const storageKey = buildStorageObjectKey({
      env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
      visibility: 'public',
      pathSegments: [
        'shops',
        shop.publicId,
        'products',
        product.publicId,
        'images',
        filenameWithoutExtension,
      ],
      extension,
      filename: 'original',
    });

    em.persist(em.create(ProductImageEntity, {
      product,
      storageKey,
      rank: index + 1,
      variantStatus: ProductImageVariantStatus.PENDING,
    }));
  });
}

async function syncProductAttributes(
  em: EntityManager,
  product: ProductEntity,
  category: CategoryEntity,
  productSeed: ProductSeed,
): Promise<void> {
  await em.nativeDelete(ProductAttributeValueEntity, { product: product.id });

  const attributes = await em.find(
    CategoryAttributeEntity,
    { category },
    { orderBy: { rank: 'asc' }, populate: ['options'] },
  );
  const selectedValuesByAttributeKey = new Map(
    productSeed.attributes.map((attribute) => [attribute.attributeKey, attribute.optionValue]),
  );

  for (const attribute of attributes) {
    const options = attribute.options.getItems().sort((a, b) => a.rank - b.rank);
    const selectedOptionValue = selectedValuesByAttributeKey.get(attribute.key);

    if (!selectedOptionValue) {
      continue;
    }

    const selectedOption = options.find((option) => option.value === selectedOptionValue);

    if (!selectedOption) {
      throw new Error(
        `Missing option "${selectedOptionValue}" for attribute "${attribute.key}" on seeded product "${productSeed.shopSlug}::${productSeed.title}"`,
      );
    }

    em.persist(
      em.create(ProductAttributeValueEntity, {
        product,
        categoryAttribute: attribute,
        selectedOption,
      }),
    );
  }
}

async function syncProductOptions(
  em: EntityManager,
  product: ProductEntity,
  productSeed: ProductSeed,
): Promise<{
  valuesBySelectionKey: Map<string, ProductOptionValueEntity>;
  optionsBySeedKey: Map<string, ProductOptionEntity>;
}> {
  const existingOptions = await em.find(
    ProductOptionEntity,
    { product },
    { populate: ['values'], orderBy: { position: 'asc' } },
  );
  const existingOptionsBySeedId = new Map(
    existingOptions.map((option) => [option.id, option]),
  );
  const existingOptionsByPosition = new Map(
    existingOptions.map((option) => [option.position, option]),
  );
  const valuesBySelectionKey = new Map<string, ProductOptionValueEntity>();
  const optionsBySeedKey = new Map<string, ProductOptionEntity>();

  for (const [optionIndex, optionSeed] of productSeed.options.entries()) {
    const position = optionIndex + 1;
    const optionSeedId = deterministicSeedUuid(`product-option:${product.id}:${optionSeed.key}`);
    const option = existingOptionsBySeedId.get(optionSeedId) ?? existingOptionsByPosition.get(position) ?? em.create(ProductOptionEntity, {
      id: optionSeedId,
      product,
      name: optionSeed.name,
      normalizedName: normalizeProductOptionLabel(optionSeed.name),
      position,
    });
    if (option.id !== optionSeedId && option.normalizedName !== normalizeProductOptionLabel(optionSeed.name)) {
      throw new Error(`Seed option identity does not match existing product ${product.id}; refusing positional reassignment`);
    }

    option.product = product;
    option.name = optionSeed.name;
    option.normalizedName = normalizeProductOptionLabel(optionSeed.name);
    option.position = position;
    option.removedAt = undefined;
    optionsBySeedKey.set(optionSeed.key, option);
    em.persist(option);

    const existingValuesBySeedId = new Map(
      option.values.getItems().map((value) => [value.id, value]),
    );
    const existingValuesByLabel = new Map(
      option.values.getItems().map((value) => [value.normalizedValue, value]),
    );

    for (const [valueIndex, valueSeed] of optionSeed.values.entries()) {
      const valuePosition = valueIndex + 1;
      const valueSeedId = deterministicSeedUuid(`product-option-value:${product.id}:${optionSeed.key}:${valueSeed.key}`);
      const value = existingValuesBySeedId.get(valueSeedId) ?? existingValuesByLabel.get(normalizeProductOptionLabel(valueSeed.value)) ?? em.create(ProductOptionValueEntity, {
        id: valueSeedId,
        productOption: option,
        value: valueSeed.value,
        normalizedValue: normalizeProductOptionLabel(valueSeed.value),
        position: valuePosition,
      });

      value.productOption = option;
      value.value = valueSeed.value;
      value.normalizedValue = normalizeProductOptionLabel(valueSeed.value);
      value.position = valuePosition;
      value.removedAt = undefined;
      option.values.add(value);
      em.persist(value);
      valuesBySelectionKey.set(`${optionSeed.key}:${valueSeed.key}`, value);
    }
  }

  await em.flush();
  return { valuesBySelectionKey, optionsBySeedKey };
}

function resolveVariantValueIds(
  productSeed: ProductSeed,
  inventorySeed: ProductSeed['inventory'][number],
  valuesBySelectionKey: Map<string, ProductOptionValueEntity>,
): string[] {
  const valueIds: string[] = [];

  for (const optionSeed of productSeed.options) {
    const valueKey = inventorySeed.selections[optionSeed.key];
    const value = valuesBySelectionKey.get(`${optionSeed.key}:${valueKey}`);
    if (!value) {
      throw new Error(`Missing option value "${optionSeed.key}:${valueKey}" for product seed ${productSeed.shopSlug}::${productSeed.title}`);
    }
    valueIds.push(value.id);
  }

  return valueIds;
}

async function syncProductVariantSelections(
  em: EntityManager,
  product: ProductEntity,
  productSeed: ProductSeed,
  variant: ProductVariantEntity,
  inventorySeed: ProductSeed['inventory'][number],
  valuesBySelectionKey: Map<string, ProductOptionValueEntity>,
  optionsBySeedKey: Map<string, ProductOptionEntity>,
): Promise<void> {
  const existingSelections = await em.find(ProductVariantOptionValueEntity, { productVariant: variant.id });
  const existingByOption = new Map(existingSelections.map(selection => [selection.productOption.id, selection]));
  const intendedOptionIds = new Set([...optionsBySeedKey.values()].map(option => option.id));
  if (existingSelections.some(selection => !intendedOptionIds.has(selection.productOption.id))) {
    throw new Error(`Seed variant ${variant.id} has different existing selections; refusing history reassignment`);
  }

  for (const optionSeed of productSeed.options) {
    const option = optionsBySeedKey.get(optionSeed.key);
    const valueKey = inventorySeed.selections[optionSeed.key];
    const value = valuesBySelectionKey.get(`${optionSeed.key}:${valueKey}`);
    if (!option || !value) {
      throw new Error(`Missing persisted selection "${optionSeed.key}:${valueKey}" for product seed ${productSeed.shopSlug}::${productSeed.title}`);
    }

    const existing = existingByOption.get(option.id);
    if (existing) {
      if (existing.productOptionValue.id !== value.id) {
        throw new Error(`Seed variant ${variant.id} selects a different value; refusing history reassignment`);
      }
      continue;
    }
    em.persist(em.create(ProductVariantOptionValueEntity, {
      product,
      productVariant: variant,
      productOption: option,
      productOptionValue: value,
    }));
  }
}

async function syncProductVariants(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity,
  productSeed: ProductSeed,
  valuesBySelectionKey: Map<string, ProductOptionValueEntity>,
  optionsBySeedKey: Map<string, ProductOptionEntity>,
): Promise<Map<string, ProductVariantEntity>> {
  const inventorySeedSkus = productSeed.inventory.map((inventorySeed) => inventorySeed.sku);
  const existingInventories = await em.find(
    ProductInventoryEntity,
    { shop, sku: { $in: inventorySeedSkus } },
    { populate: ['productVariant'] },
  );
  const existingInventoriesBySku = new Map(
    existingInventories
      .filter((inventory) => inventory.sku)
      .map((inventory) => [inventory.sku as string, inventory]),
  );
  const existingVariants = await em.find(ProductVariantEntity, { product });
  const existingVariantsByCombinationKey = new Map(
    existingVariants.map((variant) => [variant.combinationKey, variant]),
  );

  const variantsBySelectionKey = new Map<string, ProductVariantEntity>();
  for (const [index, inventorySeed] of productSeed.inventory.entries()) {
    const selectionKey = buildSeedSelectionKey(inventorySeed.selections);
    const combinationKey = buildProductOptionCombinationKey(
      resolveVariantValueIds(productSeed, inventorySeed, valuesBySelectionKey),
    );
    const inventoryVariant = existingInventoriesBySku.get(inventorySeed.sku)?.productVariant;
    if (inventoryVariant && (inventoryVariant.product.id !== product.id || inventoryVariant.combinationKey !== combinationKey)) {
      throw new Error(`Seed SKU ${inventorySeed.sku} belongs to a different product or selection; refusing to reassign inventory history`);
    }
    const variant = inventoryVariant ?? existingVariantsByCombinationKey.get(combinationKey) ?? em.create(ProductVariantEntity, {
      id: deterministicSeedUuid(`product-variant:${product.id}:${selectionKey}`),
      product,
      combinationKey,
      rank: index + 1,
    });

    variant.product = product;
    variant.combinationKey = combinationKey;
    variant.rank = index + 1;
    variant.lifecycleState = inventorySeed.variantState;
    variant.removedAt = inventorySeed.variantState === ProductVariantLifecycleState.REMOVED ? new Date() : undefined;
    em.persist(variant);
    variantsBySelectionKey.set(selectionKey, variant);
    await syncProductVariantSelections(em, product, productSeed, variant, inventorySeed, valuesBySelectionKey, optionsBySeedKey);
  }

  return variantsBySelectionKey;
}

async function syncProductInventory(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity,
  inventorySeeds: ProductSeed['inventory'],
  variantsBySelectionKey: Map<string, ProductVariantEntity>,
): Promise<void> {
  const inventorySeedSkus = inventorySeeds
    .map((inventorySeed) => inventorySeed.sku.trim())
    .filter(Boolean);
  const existingInventories = await em.find(
    ProductInventoryEntity,
    {
      shop,
      sku: { $in: inventorySeedSkus },
    },
    { populate: ['prices', 'productVariant'] },
  );
  const existingInventoriesBySku = new Map(
    existingInventories
      .filter((inventory) => inventory.sku)
      .map((inventory) => [inventory.sku as string, inventory]),
  );

  // The default seller Stock Pool is the authoritative quantity holder, so the
  // seeded Inventory Items must be backed by one. Preload both the pools of the
  // matched Inventory Items and the pools a previous run would have created for
  // the deterministic Inventory Item ids.
  const seededInventoryIds = inventorySeeds.map((inventorySeed) =>
    deterministicSeedUuid(
      `product-inventory:${product.id}:${buildSeedSelectionKey(inventorySeed.selections)}`,
    ));
  const candidateInventoryIds = [
    ...new Set([
      ...existingInventories.map((inventory) => inventory.id),
      ...seededInventoryIds,
    ]),
  ];
  const existingStockPools = await em.find(ProductStockPoolEntity, {
    inventory: { $in: candidateInventoryIds },
  });
  const stockPoolByInventoryId = new Map(
    existingStockPools.map((stockPool) => [stockPool.inventory.id, stockPool]),
  );

  const createdInventories: Array<{
    inventory: ProductInventoryEntity;
    seed: ProductSeed['inventory'][number];
  }> = [];
  inventorySeeds.forEach((inventorySeed) => {
    const selectionKey = buildSeedSelectionKey(inventorySeed.selections);
    const inventory = existingInventoriesBySku.get(inventorySeed.sku) ??
      em.create(ProductInventoryEntity, {
        id: deterministicSeedUuid(`product-inventory:${product.id}:${selectionKey}`),
        shop,
        product,
        sku: inventorySeed.sku,
        stock: inventorySeed.stock,
        onHandQuantity: inventorySeed.stock,
      });
    const variant = variantsBySelectionKey.get(selectionKey);
    if (!variant) {
      throw new Error(`Missing variant for inventory seed ${productSeedKey(product)}::${inventorySeed.sku}`);
    }

    inventory.shop = shop;
    inventory.product = product;
    inventory.productVariant = variant;
    inventory.sku = inventorySeed.sku;
    inventory.lifecycleState = inventorySeed.variantState === ProductVariantLifecycleState.REMOVED
      ? ProductInventoryLifecycleState.REMOVED
      : inventorySeed.variantState === ProductVariantLifecycleState.INACTIVE
        ? ProductInventoryLifecycleState.INACTIVE
        : ProductInventoryLifecycleState.ACTIVE;
    inventory.removedAt = inventorySeed.variantState === ProductVariantLifecycleState.REMOVED ? new Date() : undefined;

    const stockPool = stockPoolByInventoryId.get(inventory.id) ??
      em.create(ProductStockPoolEntity, {
        id: deterministicSeedUuid(`product-stock-pool:${inventory.id}`),
        inventory,
        shop,
      });

    stockPool.inventory = inventory;
    stockPool.shop = shop;
    stockPool.name = DEFAULT_SELLER_STOCK_POOL_NAME;
    stockPool.custody = ProductStockPoolCustody.SELLER;
    stockPool.isDefault = true;
    stockPool.lifecycleState = ProductStockPoolLifecycleState.ACTIVE;
    stockPool.onHandQuantity = inventorySeed.stock;
    stockPool.stock = Math.max(0, stockPool.onHandQuantity - stockPool.reservedQuantity);
    stockPoolByInventoryId.set(inventory.id, stockPool);
    em.persist(stockPool);

    // The pool holds the quantity; the Inventory Item only mirrors it.
    inventory.onHandQuantity = stockPool.onHandQuantity;
    inventory.reservedQuantity = stockPool.reservedQuantity;
    inventory.onHandVersion = stockPool.onHandVersion;
    inventory.stock = stockPool.stock;

    createdInventories.push({
      inventory,
      seed: inventorySeed,
    });
    em.persist(inventory);
  });

  createdInventories.forEach(({ inventory, seed }) => {
    const activeBasePrice = inventory.prices
      .getItems()
      .find((price) => !price.marketCode && !price.activeTo);
    const amountMinor = toMinorUnits(seed.salePrice ?? seed.price, shop.currency);
    const price = activeBasePrice ??
      em.create(VariantPriceEntity, {
        id: deterministicSeedUuid(`variant-price:${inventory.id}:base`),
        productInventory: inventory,
        priceType: VARIANT_PRICE_TYPES.BASE,
        currency: shop.currency,
        amountMinor,
        activeFrom: new Date(),
      });

    price.productInventory = inventory;
    price.priceType = VARIANT_PRICE_TYPES.BASE;
    price.currency = shop.currency;
    price.amountMinor = amountMinor;

    em.persist(price);
  });
}

function productSeedKey(product: ProductEntity): string {
  return `${product.shop.id}::${product.slug}`;
}
interface SeedShippingRate {
  destinationScope: ShippingDestinationScope;
  destinationCountry?: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  deliveryTimeMinDays: number;
  deliveryTimeMaxDays: number;
}

const SEED_SHIPPING_PROFILES: Array<{
  name: string;
  status: ShippingProfileStatus;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates: SeedShippingRate[];
}> = [
  {
    name: 'Standard shipping',
    status: ShippingProfileStatus.ACTIVE,
    processingTimeMinDays: 1,
    processingTimeMaxDays: 3,
    rates: [
      {
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
        oneItemFeeMinor: 599,
        additionalItemFeeMinor: 199,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 5,
      },
      {
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'CA',
        oneItemFeeMinor: 1299,
        additionalItemFeeMinor: 399,
        deliveryTimeMinDays: 4,
        deliveryTimeMaxDays: 8,
      },
      {
        destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
        oneItemFeeMinor: 1999,
        additionalItemFeeMinor: 599,
        deliveryTimeMinDays: 7,
        deliveryTimeMaxDays: 14,
      },
    ],
  },
  {
    name: 'Express shipping',
    status: ShippingProfileStatus.ACTIVE,
    processingTimeMinDays: 1,
    processingTimeMaxDays: 2,
    rates: [
      {
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
        oneItemFeeMinor: 1499,
        additionalItemFeeMinor: 499,
        deliveryTimeMinDays: 2,
        deliveryTimeMaxDays: 3,
      },
      {
        destinationScope: ShippingDestinationScope.EVERYWHERE_ELSE,
        oneItemFeeMinor: 2999,
        additionalItemFeeMinor: 899,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 6,
      },
    ],
  },
  {
    name: 'Freight shipping',
    status: ShippingProfileStatus.DRAFT,
    rates: [],
  },
];

/**
 * Reusable shop-owned Shipping Profiles are shared by many seeded Products, so
 * they are created once per shop and never copied onto a Product.
 */
async function syncShopShippingProfiles(
  em: EntityManager,
  shop: ShopEntity,
): Promise<ShippingProfileEntity[]> {
  const existing = await em.find(
    ShippingProfileEntity,
    { shop },
    { populate: ['rates'] },
  );
  const existingByNormalizedName = new Map(
    existing.map((profile) => [profile.normalizedName, profile]),
  );
  const profiles: ShippingProfileEntity[] = [];

  for (const seedProfile of SEED_SHIPPING_PROFILES) {
    const normalizedName = seedProfile.name.toLowerCase();
    const profile = existingByNormalizedName.get(normalizedName) ??
      em.create(ShippingProfileEntity, {
        shop,
        name: seedProfile.name,
        normalizedName,
        shipFromCountry: 'US',
        shipFromPostal: pickDeterministicValue(`${shop.slug}:${normalizedName}:postal`, [
          '10001',
          '11201',
          '20001',
          '30301',
          '60601',
          '73301',
          '85001',
          '94105',
        ]),
      });

    profile.status = seedProfile.status;
    profile.shipFromCountry = profile.shipFromCountry ?? 'US';
    profile.processingTimeMinDays = seedProfile.processingTimeMinDays;
    profile.processingTimeMaxDays = seedProfile.processingTimeMaxDays;
    em.persist(profile);

    if (!existingByNormalizedName.has(normalizedName)) {
      for (const [index, rate] of seedProfile.rates.entries()) {
        em.persist(em.create(ShippingProfileRateEntity, {
          shippingProfile: profile,
          position: index + 1,
          destinationScope: rate.destinationScope,
          destinationCountry: rate.destinationCountry,
          oneItemFeeMinor: rate.oneItemFeeMinor,
          additionalItemFeeMinor: rate.additionalItemFeeMinor,
          deliveryTimeMinDays: rate.deliveryTimeMinDays,
          deliveryTimeMaxDays: rate.deliveryTimeMaxDays,
        }));
      }
    }

    profiles.push(profile);
  }

  return profiles.filter((profile) => profile.status !== ShippingProfileStatus.DRAFT);
}

async function pruneSyntheticBulkCatalogProducts(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  const syntheticShopSlug = 'bulk-catalog-lab';
  const shop = shopsBySlug.get(syntheticShopSlug);

  if (!shop) {
    return;
  }

  const seededSlugs = new Set(
    productSeeds
      .filter((seed) => seed.shopSlug === syntheticShopSlug)
      .map((seed) => slugify(seed.title)),
  );

  const existingProducts = await em.find(ProductEntity, { shop });
  const staleProducts = existingProducts.filter((product) => !seededSlugs.has(product.slug));

  for (const product of staleProducts) {
    product.state = ProductState.REMOVED;
    product.publishedAt = undefined;
    await syncProductImages(em, shop, product, []);
    em.persist(product);
  }

  if (staleProducts.length > 0) {
    await em.flush();
    console.log(
      `[seed][products] Retired ${staleProducts.length} stale synthetic products for ${syntheticShopSlug}`,
    );
  }
}

export async function seedProducts(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  const totalProducts = productSeeds.length;
  const startedAt = Date.now();
  console.log(`[seed][products] Upserting ${totalProducts} products`);

  await pruneSyntheticBulkCatalogProducts(em, shopsBySlug);

  const categoryByPath = new Map<string, CategoryEntity>();
  const shops = Array.from(
    new Map(
      productSeeds.flatMap((productSeed) => {
        const shop = shopsBySlug.get(productSeed.shopSlug);

        return shop ? [[shop.slug, shop] as const] : [];
      }),
    ).values(),
  );
  const existingProducts = shops.length > 0
    ? await em.find(ProductEntity, { shop: { $in: shops } }, { populate: ['shop'] })
    : [];
  const existingProductsByShopSlugAndSlug = new Map(
    existingProducts.map((product) => [`${product.shop.slug}::${product.slug}`, product]),
  );
  const shippingProfilesByShopId = new Map<string, ShippingProfileEntity[]>();

  for (const [index, productSeed] of productSeeds.entries()) {
    const shop = shopsBySlug.get(productSeed.shopSlug);
    if (!shop) {
      throw new Error(`Missing seeded shop: ${productSeed.shopSlug}`);
    }

    const category = await findCategoryByPath(em, productSeed.categoryPath, categoryByPath);
    const slug = slugify(productSeed.title);
    const productKey = `${shop.slug}::${slug}`;
    const product =
      existingProductsByShopSlugAndSlug.get(productKey) ??
      em.create(ProductEntity, {
        shop,
        slug,
        title: productSeed.title,
        description: productSeed.description,
        state: productSeed.state as ProductState,
        whoMade: productSeed.whoMade,
        isDigital: productSeed.isDigital,
        nonTaxable: false,
        tags: [],
        views: 0,
        ratingAverage: 0,
        reviewCount: 0,
      });
    existingProductsByShopSlugAndSlug.set(productKey, product);

    product.category = category;
    product.title = productSeed.title;
    product.description = productSeed.description;
    product.state = productSeed.state as ProductState;
    product.whoMade = productSeed.whoMade;
    product.isDigital = productSeed.isDigital;
    product.tags = [];
    product.publishedAt =
      product.state === ProductState.ACTIVE ? new Date() : undefined;
    product.views = 0;
    product.ratingAverage = 0;
    product.reviewCount = 0;
    em.persist(product);

    const imageRootDirs = process.env.SEED_ASSETS_PRODUCTS_DIR
      ? [path.resolve(process.cwd(), process.env.SEED_ASSETS_PRODUCTS_DIR)]
      : PRODUCT_IMAGE_ROOT_DIRS;
    const imageFilenames =
      product.state === ProductState.DRAFT
        ? resolveOptionalSeedProductImagePaths(
          imageRootDirs,
          productSeed.shopSlug,
          productSeed.title,
        )
        : resolveSeedProductImagePaths(
          imageRootDirs,
          productSeed.shopSlug,
          productSeed.title,
        );

    await syncProductImages(em, shop, product, imageFilenames);
    await syncProductAttributes(em, product, category, productSeed);
    const { valuesBySelectionKey, optionsBySeedKey } = await syncProductOptions(em, product, productSeed);
    const variantsBySelectionKey = await syncProductVariants(
      em,
      product,
      shop,
      productSeed,
      valuesBySelectionKey,
      optionsBySeedKey,
    );
    await syncProductInventory(
      em,
      product,
      shop,
      productSeed.inventory,
      variantsBySelectionKey,
    );
    const shopShippingProfiles = shippingProfilesByShopId.get(shop.id) ??
      await syncShopShippingProfiles(em, shop);
    shippingProfilesByShopId.set(shop.id, shopShippingProfiles);
    product.shippingProfile = productSeed.isDigital
      ? undefined
      : pickDeterministicValue(`${shop.slug}:${slug}:shipping-profile`, shopShippingProfiles);
    await em.flush();

    if ((index + 1) % 10 === 0 || index + 1 === totalProducts) {
      console.log(
        `[seed][products] Processed ${index + 1}/${totalProducts} in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }
}
