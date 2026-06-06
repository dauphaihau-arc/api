import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { TableNotFoundException } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/postgresql';
import { validateAppEnv } from '../src/config/app-env.config';
import { buildDatabaseConfig } from '../src/config/database.config';
import { buildStorageConfig, type StorageConfig } from '../src/config/storage.config';
import { CategoryEntity } from '../src/modules/domains/category/infra/persistence/entities/category.entity';
import { ProductImageService } from '../src/modules/domains/product/app/services/product-image.service';
import { ProductImageEntity } from '../src/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductImageVariantEntity } from '../src/modules/domains/product/infra/persistence/entities/product-image-variant.entity';
import { ProductEntity } from '../src/modules/domains/product/infra/persistence/entities/product.entity';
import { ShopEntity } from '../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { SharpImageTransformService } from '../src/modules/shared/image-transform/infra/sharp-image-transform.service';
import type { StorageService } from '../src/modules/shared/storage/app/ports/storage.service';
import { LocalFileStorageService } from '../src/modules/shared/storage/infra/local-file-storage.service';
import { MinioStorageService } from '../src/modules/shared/storage/infra/minio-storage.service';
import {
  resolveOptionalSeedProductAssetDirectory,
  resolveOptionalSeedProductImagePaths,
  resolveSeedProductAssetDirectory,
  resolveSeedProductImagePaths,
  slugifySeedValue,
} from '../database/seeds/product-seed-image-resolver';
import {
  PRODUCT_IMAGE_ROOT_DIRS,
  PRODUCT_LOCAL_TSV_PATH,
  PRODUCT_TSV_PATH,
  SHOPS_LOCAL_TSV_PATH,
  SHOPS_TSV_PATH,
} from '../database/seeds/product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from '../database/seeds/shared/read-tsv-rows';

type ShopCsvRow = {
  shop_slug: string;
  shop_name: string;
};

type MinimalProductSeed = {
  shopSlug: string;
  title: string;
  state: 'active' | 'draft' | 'inactive';
};

type ProductCsvRow = {
  shop_slug: string;
  category_path: string;
  title: string;
  state?: string;
};

const ROOT_DIR = path.resolve(__dirname, '../..');
const SEED_ASSETS_DIR = path.join(ROOT_DIR, 'seed-data');
const CATEGORY_ASSETS_DIR = path.join(SEED_ASSETS_DIR, 'images', 'categories');

function assertFileExists(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Asset file not found: ${filePath}`);
  }
}

function resolveContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      throw new Error(`Unsupported asset extension: ${filePath}`);
  }
}

function loadShopNamesBySlug(): Map<string, string> {
  const rows = [
    ...readTsvRows<ShopCsvRow>(SHOPS_TSV_PATH),
    ...readOptionalTsvRows<ShopCsvRow>(SHOPS_LOCAL_TSV_PATH),
  ];

  return new Map(
    rows.map((row) => [row.shop_slug.trim(), row.shop_name.trim()])
  );
}

function loadProductSeedsMinimal(): MinimalProductSeed[] {
  const rows = [
    ...readTsvRows<ProductCsvRow>(PRODUCT_TSV_PATH),
    ...readOptionalTsvRows<ProductCsvRow>(PRODUCT_LOCAL_TSV_PATH),
  ];

  return rows.map((row, index) => {
    if (!row.shop_slug.trim() || !row.category_path.trim() || !row.title.trim()) {
      throw new Error(
        `Product seed row ${index + 2} must include shop_slug, category_path, and title`
      );
    }

    return {
      shopSlug: row.shop_slug.trim(),
      title: row.title.trim(),
      state: row.state?.trim() === 'draft'
        ? 'draft'
        : row.state?.trim() === 'inactive'
          ? 'inactive'
          : 'active',
    };
  });
}

function buildStorageService(): StorageService {
  const env = validateAppEnv(process.env);
  const config = buildStorageConfig({
    get: ((key: string | symbol, defaultValue?: unknown) =>
      env[key as string] ?? defaultValue) as never,
  });

  return createStorageService(config);
}

function createStorageService(config: StorageConfig): StorageService {
  return config.driver === 'local'
    ? new LocalFileStorageService(config)
    : new MinioStorageService(config);
}

async function putSeedAsset(
  storageService: StorageService,
  key: string,
  sourceFile: string
): Promise<void> {
  assertFileExists(sourceFile);

  await storageService.putObject({
    key,
    body: await readFile(sourceFile),
    contentType: resolveContentType(sourceFile),
  });
}

async function main(): Promise<void> {
  const storageService = buildStorageService();

  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env),
    entities: [
      CategoryEntity,
      ShopEntity,
      ProductEntity,
      ProductImageEntity,
      ProductImageVariantEntity,
    ],
  });

  try {
    const em = orm.em.fork();
    const productImageService = new ProductImageService(
      orm.em,
      storageService,
      new SharpImageTransformService()
    );
    const shopNamesBySlug = loadShopNamesBySlug();
    const productSeeds = loadProductSeedsMinimal();
    let categories: CategoryEntity[];

    try {
      categories = await em.find(
        CategoryEntity,
        { imageStorageKey: { $ne: null } }
      );
    }
    catch (error) {
      if (error instanceof TableNotFoundException) {
        throw new Error(
          'Seed tables not found. Run "just db-seed" or "just db-seed-demo" before "just storage-seed".'
        );
      }

      throw error;
    }

    for (const category of categories) {
      if (!category.imageStorageKey) {
        continue;
      }

      const sourceFile = path.join(
        CATEGORY_ASSETS_DIR,
        path.basename(category.imageStorageKey)
      );

      await putSeedAsset(storageService, category.imageStorageKey, sourceFile);
      console.log(`Uploaded category asset -> ${category.imageStorageKey}`);
    }

    for (const productSeed of productSeeds) {
      const shopName = shopNamesBySlug.get(productSeed.shopSlug);
      if (!shopName) {
        throw new Error(`Missing shop seed mapping for slug: ${productSeed.shopSlug}`);
      }

      const shop = await em.findOne(ShopEntity, { shopName });
      if (!shop) {
        throw new Error(
          `Missing seeded shop: ${shopName}. Run the database seed first with "just db-seed" (or "just db-seed-demo"), then rerun "just storage-seed".`
        );
      }

      const product = await em.findOne(
        ProductEntity,
        { shop, slug: slugifySeedValue(productSeed.title) },
        { populate: ['images', 'images.variants'] }
      );

      if (!product) {
        throw new Error(
          `Missing seeded product: ${productSeed.title}. Run the database seed first with "just db-seed" (or "just db-seed-demo"), then rerun "just storage-seed".`
        );
      }

      const imageFilenames =
        productSeed.state === 'draft'
          ? resolveOptionalSeedProductImagePaths(
            PRODUCT_IMAGE_ROOT_DIRS,
            productSeed.shopSlug,
            productSeed.title
          )
          : resolveSeedProductImagePaths(
            PRODUCT_IMAGE_ROOT_DIRS,
            productSeed.shopSlug,
            productSeed.title
          );
      const assetDirectory =
        productSeed.state === 'draft'
          ? resolveOptionalSeedProductAssetDirectory(
            PRODUCT_IMAGE_ROOT_DIRS,
            productSeed.shopSlug,
            productSeed.title
          )
          : resolveSeedProductAssetDirectory(
            PRODUCT_IMAGE_ROOT_DIRS,
            productSeed.shopSlug,
            productSeed.title
          );
      const images = product.images.getItems().sort((a, b) => a.rank - b.rank);

      if (!assetDirectory && images.length === 0) {
        continue;
      }

      if (images.length !== imageFilenames.length) {
        throw new Error(
          `Image count mismatch for seeded product "${productSeed.title}".`
        );
      }

      if (!assetDirectory) {
        throw new Error(
          `Missing product asset directory for seeded product "${productSeed.title}".`
        );
      }

      for (const [index, image] of images.entries()) {
        const sourceFile = path.join(
          assetDirectory,
          path.basename(imageFilenames[index])
        );

        await putSeedAsset(storageService, image.storageKey, sourceFile);
        console.log(`Uploaded product asset -> ${image.storageKey}`);
      }

      await productImageService.generateVariants(product.id);
      console.log(`Generated product image variants -> ${product.slug}`);
    }
  } finally {
    await orm.close(true);
  }

  console.log('Seed asset upload complete.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
