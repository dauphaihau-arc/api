import type { EntityManager } from '@mikro-orm/postgresql';
import { basename, extname } from 'node:path';
import * as path from 'node:path';
import { CategoryAttributeEntity } from '../../src/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '../../src/modules/domains/category/infra/persistence/entities/category.entity';
import { ProductState } from '../../src/modules/domains/product/domain/enums/product-state.enum';
import { ProductImageVariantStatus } from '../../src/modules/domains/product/domain/enums/product-image-variant-status.enum';
import { ProductShippingCharge } from '../../src/modules/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '../../src/modules/domains/product/domain/enums/product-variant-type.enum';
import type { MarketplaceCurrency } from '../../src/config/marketplace.config';
import {
  buildStorageObjectKey,
  resolveStorageEnvironmentSegment,
} from '../../src/modules/shared/storage/app/storage-key-builder';
import { ProductAttributeValueEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { VariantPriceEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { VARIANT_PRICE_TYPES } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { ProductVariantEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ShopEntity } from '../../src/modules/domains/shop/infra/persistence/entities/shop.entity';
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

function buildVariantKey(
  variantType: ProductVariantType,
  inventorySeed: ProductSeed['inventory'][number],
): string | undefined {
  if (variantType === ProductVariantType.NONE) {
    return undefined;
  }

  return variantType === ProductVariantType.COMBINE
    ? `${inventorySeed.optionValue1 ?? ''}::${inventorySeed.optionValue2 ?? ''}`
    : `${inventorySeed.optionValue1 ?? ''}`;
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
      path: [
        { domain: 'shops', id: shop.publicId },
        { domain: 'products', id: product.publicId },
      ],
      collection: 'images',
      assetPath: [filenameWithoutExtension],
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

async function syncProductVariants(
  em: EntityManager,
  product: ProductEntity,
  variantType: ProductVariantType,
  inventorySeeds: ProductSeed['inventory'],
): Promise<Map<string, ProductVariantEntity>> {
  const variantsByKey = new Map<string, ProductVariantEntity>();
  if (variantType === ProductVariantType.NONE) {
    return variantsByKey;
  }

  const existingVariants = await em.find(ProductVariantEntity, { product });
  const existingVariantsByKey = new Map(
    existingVariants.map((variant) => [
      variantType === ProductVariantType.COMBINE
        ? `${variant.optionValue1 ?? ''}::${variant.optionValue2 ?? ''}`
        : `${variant.optionValue1 ?? ''}`,
      variant,
    ]),
  );

  const seenKeys = new Set<string>();
  inventorySeeds.forEach((inventorySeed, index) => {
    const key = buildVariantKey(variantType, inventorySeed);

    if (!key || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    const variantName =
      variantType === ProductVariantType.COMBINE
        ? `${inventorySeed.optionValue1} / ${inventorySeed.optionValue2}`
        : (inventorySeed.optionValue1 ?? 'Default');
    const variant = existingVariantsByKey.get(key) ??
      em.create(ProductVariantEntity, { product, name: variantName, rank: index + 1 });

    variant.product = product;
    variant.name = variantName;
    variant.optionValue1 = inventorySeed.optionValue1;
    variant.optionValue2 = inventorySeed.optionValue2;
    variant.rank = index + 1;

    variantsByKey.set(key, variant);
    em.persist(variant);
  });

  return variantsByKey;
}

async function syncProductInventory(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity,
  variantType: ProductVariantType,
  inventorySeeds: ProductSeed['inventory'],
  variantsByKey: Map<string, ProductVariantEntity>,
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

  const createdInventories: Array<{
    inventory: ProductInventoryEntity;
    seed: ProductSeed['inventory'][number];
  }> = [];
  inventorySeeds.forEach((inventorySeed) => {
    const variantKey = buildVariantKey(variantType, inventorySeed);
    const inventory = existingInventoriesBySku.get(inventorySeed.sku) ??
      em.create(ProductInventoryEntity, {
        shop,
        product,
        sku: inventorySeed.sku,
        stock: inventorySeed.stock,
      });

    inventory.shop = shop;
    inventory.product = product;
    inventory.productVariant = variantKey ? variantsByKey.get(variantKey) : undefined;
    inventory.sku = inventorySeed.sku;
    inventory.stock = inventorySeed.stock;

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
    const price = activeBasePrice ??
      em.create(VariantPriceEntity, {
        productInventory: inventory,
        priceType: VARIANT_PRICE_TYPES.BASE,
        currency: shop.currency,
        amountMinor: toMinorUnits(seed.salePrice ?? seed.price, shop.currency),
        activeFrom: new Date(),
      });

    price.productInventory = inventory;
    price.priceType = VARIANT_PRICE_TYPES.BASE;
    price.currency = shop.currency;
    price.amountMinor = toMinorUnits(seed.salePrice ?? seed.price, shop.currency);
    price.originalAmountMinor = seed.salePrice !== undefined
      ? toMinorUnits(seed.price, shop.currency)
      : undefined;

    em.persist(price);
  });
}

async function syncProductShipping(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity,
): Promise<void> {
  const profiles = await em.find(ProductShippingProfileEntity, { product });
  const profileIds = profiles.map((profile) => profile.id);

  if (profileIds.length > 0) {
    await em.nativeDelete(ProductShippingDestinationEntity, {
      shippingProfile: { $in: profileIds },
    });
    await em.nativeDelete(ProductShippingProfileEntity, { id: { $in: profileIds } });
  }

  const shippingSeed = `${shop.slug}:${product.slug}`;
  const originZip = pickDeterministicValue(shippingSeed, [
    '10001',
    '11201',
    '20001',
    '30301',
    '60601',
    '73301',
    '85001',
    '94105',
  ]);
  const processTimeLabel = pickDeterministicValue(`${shippingSeed}:process`, [
    '1 business day',
    '1-2 business days',
    '2-3 business days',
  ]);
  const deliveryTimeLabel = pickDeterministicValue(`${shippingSeed}:delivery`, [
    '1-3 business days',
    '2-5 business days',
    '3-5 business days',
    '3-7 business days',
  ]);
  const service = pickDeterministicValue(`${shippingSeed}:service`, [
    'standard',
    'ground',
    'economy',
  ]);
  const chargeType = pickDeterministicValue(`${shippingSeed}:charge`, [
    ProductShippingCharge.FREE_SHIPPING,
    ProductShippingCharge.FIXED_PRICE,
    ProductShippingCharge.FIXED_PRICE,
  ]);

  const shippingProfile = em.create(ProductShippingProfileEntity, {
    product,
    shop,
    originCountry: 'US',
    originZip,
    processTimeLabel,
  });
  em.persist(shippingProfile);

  em.persist(
    em.create(ProductShippingDestinationEntity, {
      shippingProfile,
      countryCode: 'US',
      deliveryTimeLabel,
      service,
      chargeType,
      rank: 1,
    }),
  );
}

async function clearProductShipping(
  em: EntityManager,
  product: ProductEntity,
): Promise<void> {
  const profiles = await em.find(ProductShippingProfileEntity, { product });
  const profileIds = profiles.map((profile) => profile.id);

  if (profileIds.length === 0) {
    return;
  }

  await em.nativeDelete(ProductShippingDestinationEntity, {
    shippingProfile: { $in: profileIds },
  });
  await em.nativeDelete(ProductShippingProfileEntity, { id: { $in: profileIds } });
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
    product.variantType = productSeed.variantType;
    product.variantGroupName = productSeed.variantGroupName;
    product.variantSubGroupName = productSeed.variantSubGroupName;
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
    const variantsByKey = await syncProductVariants(
      em,
      product,
      productSeed.variantType,
      productSeed.inventory,
    );
    await syncProductInventory(
      em,
      product,
      shop,
      productSeed.variantType,
      productSeed.inventory,
      variantsByKey,
    );
    if (productSeed.isDigital) {
      await clearProductShipping(em, product);
    }
    else {
      await syncProductShipping(em, product, shop);
    }
    await em.flush();

    if ((index + 1) % 10 === 0 || index + 1 === totalProducts) {
      console.log(
        `[seed][products] Processed ${index + 1}/${totalProducts} in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }
}
