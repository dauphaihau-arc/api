import type { EntityManager } from '@mikro-orm/postgresql';
import { basename, extname } from 'node:path';
import * as path from 'node:path';
import { CategoryAttributeEntity } from '../../src/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '../../src/modules/domains/category/infra/persistence/entities/category.entity';
import { ProductState } from '../../src/modules/domains/product/domain/enums/product-state.enum';
import { ProductImageVariantStatus } from '../../src/modules/domains/product/domain/enums/product-image-variant-status.enum';
import { ProductShippingCharge } from '../../src/modules/domains/product/domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '../../src/modules/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../src/modules/domains/product/domain/enums/product-who-made.enum';
import type { MarketplaceCurrency } from '../../src/config/marketplace.config';
import {
  buildStorageObjectKey,
  resolveStorageEnvironmentSegment,
} from '../../src/modules/shared/storage/app/storage-key-builder';
import { ProductAttributeValueEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-attribute-value.entity';
import { ProductImageEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductInventoryEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-shipping-profile.entity';
import { VariantPriceEntity } from '../../src/modules/domains/product/infra/persistence/entities/variant-price.entity';
import { ProductVariantEntity } from '../../src/modules/domains/product/infra/persistence/entities/product-variant.entity';
import { ProductEntity } from '../../src/modules/domains/product/infra/persistence/entities/product.entity';
import type { ShopEntity } from '../../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { productSeeds, type ProductSeed } from './product.data';
import { PRODUCT_IMAGE_ROOT_DIRS } from './product-seed-paths';
import {
  resolveOptionalSeedProductImagePaths,
  resolveSeedProductImagePaths,
  slugifySeedValue,
} from './product-seed-image-resolver';

function slugify(value: string): string {
  return slugifySeedValue(value);
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
  return Math.round(amount * 10 ** decimals);
}

async function findCategoryByPath(em: EntityManager, path: string[]): Promise<CategoryEntity> {
  let parent: CategoryEntity | null = null;
  let category: CategoryEntity | null = null;

  for (const name of path) {
    category = await em.findOne(CategoryEntity, { name, parent: parent ?? null });
    if (!category) {
      throw new Error(`Missing seeded category path: ${path.join(' > ')}`);
    }
    parent = category;
  }

  if (!category) {
    throw new Error(`Missing seeded category path: ${path.join(' > ')}`);
  }

  return category;
}

async function syncProductImages(
  em: EntityManager,
  shop: ShopEntity,
  product: ProductEntity,
  imageFilenames: string[]
): Promise<void> {
  for (const image of await em.find(ProductImageEntity, { product })) {
    em.remove(image);
  }
  await em.flush();

  imageFilenames.forEach((imageFilename, index) => {
    const normalizedFilename = basename(imageFilename.trim());
    const extension = extname(normalizedFilename).replace(/^\./, '').toLowerCase();
    const filenameWithoutExtension = normalizedFilename.slice(
      0,
      normalizedFilename.length - extension.length - 1
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
  await em.flush();
}

async function syncProductAttributes(
  em: EntityManager,
  product: ProductEntity,
  category: CategoryEntity
): Promise<void> {
  for (const value of await em.find(ProductAttributeValueEntity, { product })) {
    em.remove(value);
  }
  await em.flush();

  const attributes = await em.find(
    CategoryAttributeEntity,
    { category },
    { orderBy: { rank: 'asc' }, populate: ['options'] }
  );

  for (const [index, attribute] of attributes.entries()) {
    const options = attribute.options.getItems().sort((a, b) => a.rank - b.rank);
    const selectedOption = options[index % Math.max(options.length, 1)];
    em.persist(
      em.create(ProductAttributeValueEntity, {
        product,
        categoryAttribute: attribute,
        selectedOption,
      })
    );
  }

  await em.flush();
}

async function syncProductVariants(
  em: EntityManager,
  product: ProductEntity,
  variantType: ProductVariantType,
  inventorySeeds: ProductSeed['inventory']
): Promise<Map<string, ProductVariantEntity>> {
  for (const variant of await em.find(ProductVariantEntity, { product })) {
    em.remove(variant);
  }
  await em.flush();

  const variantsByKey = new Map<string, ProductVariantEntity>();
  if (variantType === ProductVariantType.NONE) {
    return variantsByKey;
  }

  const seenKeys = new Set<string>();
  inventorySeeds.forEach((inventorySeed, index) => {
    const key =
      variantType === ProductVariantType.COMBINE
        ? `${inventorySeed.optionValue1 ?? ''}::${inventorySeed.optionValue2 ?? ''}`
        : `${inventorySeed.optionValue1 ?? ''}`;

    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    const variant = em.create(ProductVariantEntity, {
      product,
      name:
        variantType === ProductVariantType.COMBINE
          ? `${inventorySeed.optionValue1} / ${inventorySeed.optionValue2}`
          : (inventorySeed.optionValue1 ?? 'Default'),
      optionValue1: inventorySeed.optionValue1,
      optionValue2: inventorySeed.optionValue2,
      rank: index + 1,
    });

    variantsByKey.set(key, variant);
    em.persist(variant);
  });

  await em.flush();
  return variantsByKey;
}

async function syncProductInventory(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity,
  variantType: ProductVariantType,
  inventorySeeds: ProductSeed['inventory'],
  variantsByKey: Map<string, ProductVariantEntity>
): Promise<void> {
  for (const inventory of await em.find(ProductInventoryEntity, { product })) {
    em.remove(inventory);
  }
  await em.flush();

  const createdInventories: Array<{
    inventory: ProductInventoryEntity;
    seed: ProductSeed['inventory'][number];
  }> = [];
  inventorySeeds.forEach((inventorySeed) => {
    const variantKey =
      variantType === ProductVariantType.NONE
        ? undefined
        : variantType === ProductVariantType.COMBINE
          ? `${inventorySeed.optionValue1 ?? ''}::${inventorySeed.optionValue2 ?? ''}`
          : `${inventorySeed.optionValue1 ?? ''}`;

    const inventory = em.create(ProductInventoryEntity, {
      shop,
      product,
      productVariant: variantKey ? variantsByKey.get(variantKey) : undefined,
      sku: inventorySeed.sku,
      stock: inventorySeed.stock,
    });

    createdInventories.push({
      inventory,
      seed: inventorySeed,
    });
    em.persist(inventory);
  });

  await em.flush();

  createdInventories.forEach(({ inventory, seed }) => {
    em.persist(
      em.create(VariantPriceEntity, {
        productInventory: inventory,
        currency: shop.currency,
        amountMinor: toMinorUnits(seed.salePrice ?? seed.price, shop.currency),
        originalAmountMinor: seed.salePrice !== undefined
          ? toMinorUnits(seed.price, shop.currency)
          : undefined,
        activeFrom: new Date(),
      })
    );
  });

  await em.flush();
}

async function syncProductShipping(
  em: EntityManager,
  product: ProductEntity,
  shop: ShopEntity
): Promise<void> {
  const profiles = await em.find(
    ProductShippingProfileEntity,
    { product },
    { populate: ['destinations'] }
  );

  for (const profile of profiles) {
    for (const destination of profile.destinations.getItems()) {
      em.remove(destination);
    }
    em.remove(profile);
  }
  await em.flush();

  const shippingProfile = em.create(ProductShippingProfileEntity, {
    product,
    shop,
    originCountry: 'US',
    originZip: '27006',
    processTimeLabel: '1 business day',
  });
  em.persist(shippingProfile);
  await em.flush();

  em.persist(
    em.create(ProductShippingDestinationEntity, {
      shippingProfile,
      countryCode: 'US',
      deliveryTimeLabel: '1-3 business days',
      service: 'standard',
      chargeType: ProductShippingCharge.FREE_SHIPPING,
      rank: 1,
    })
  );
  await em.flush();
}

export async function seedProducts(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>
): Promise<void> {
  const totalProducts = productSeeds.length;
  console.log(`[seed][products] Upserting ${totalProducts} products`);

  for (const [index, productSeed] of productSeeds.entries()) {
    const shop = shopsBySlug.get(productSeed.shopSlug);
    if (!shop) {
      throw new Error(`Missing seeded shop: ${productSeed.shopSlug}`);
    }

    const category = await findCategoryByPath(em, productSeed.categoryPath);
    const slug = slugify(productSeed.title);
    const product =
      (await em.findOne(ProductEntity, { shop, slug })) ??
      em.create(ProductEntity, {
        shop,
        slug,
        title: productSeed.title,
        description: productSeed.description,
        state: productSeed.state as ProductState,
        whoMade: productSeed.whoMade,
        isDigital: false,
        nonTaxable: false,
        views: 0,
        ratingAverage: 0,
      });

    product.category = category;
    product.title = productSeed.title;
    product.description = productSeed.description;
    product.state = productSeed.state as ProductState;
    product.whoMade = productSeed.whoMade;
    product.variantType = productSeed.variantType;
    product.variantGroupName = productSeed.variantGroupName;
    product.variantSubGroupName = productSeed.variantSubGroupName;
    product.publishedAt =
      product.state === ProductState.ACTIVE ? new Date() : undefined;
    product.views = 0;
    product.ratingAverage = 0;
    em.persist(product);
    await em.flush();

    const imageRootDirs = process.env.SEED_ASSETS_PRODUCTS_DIR
      ? [path.resolve(process.cwd(), process.env.SEED_ASSETS_PRODUCTS_DIR)]
      : PRODUCT_IMAGE_ROOT_DIRS;
    const imageFilenames =
      product.state === ProductState.DRAFT
        ? resolveOptionalSeedProductImagePaths(
          imageRootDirs,
          productSeed.shopSlug,
          productSeed.title
        )
        : resolveSeedProductImagePaths(
          imageRootDirs,
          productSeed.shopSlug,
          productSeed.title
        );

    await syncProductImages(em, shop, product, imageFilenames);
    await syncProductAttributes(em, product, category);
    const variantsByKey = await syncProductVariants(
      em,
      product,
      productSeed.variantType,
      productSeed.inventory
    );
    await syncProductInventory(
      em,
      product,
      shop,
      productSeed.variantType,
      productSeed.inventory,
      variantsByKey
    );
    await syncProductShipping(em, product, shop);

    if ((index + 1) % 10 === 0 || index + 1 === totalProducts) {
      console.log(`[seed][products] Processed ${index + 1}/${totalProducts}`);
    }
  }
}
