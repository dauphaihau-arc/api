import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { TableNotFoundException } from '@mikro-orm/core';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { validateAppEnv } from '~/platform/config/app-env.config';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import {
  buildStorageConfig,
  type LocalStorageConfig,
  type MinioStorageConfig,
  type StorageConfig,
} from '~/platform/config/storage.config';
import {
  CATEGORY_IMAGE_VARIANT_SPECS,
  type CategoryImageVariant,
} from '~/domains/category/app/config/category-image-variant.config';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { ProductImageService } from '~/domains/product/app/services/product-image.service';
import { ReviewImageService } from '~/domains/product/app/services/review-image.service';
import { ProductImageVariantStatus } from '~/domains/product/domain/enums/product-image-variant-status.enum';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductImageVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image-variant.entity';
import { ProductReviewImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review-image.entity';
import { ProductReviewImageVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review-image-variant.entity';
import { MikroOrmProductImageVariantGenerationRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-product-image-variant-generation.repository';
import { MikroOrmReviewImageVariantGenerationRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-review-image-variant-generation.repository';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { SharpImageTransformService } from '~/integrations/image-transform/infra/sharp-image-transform.service';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  buildStorageObjectKey,
  resolveStorageEnvironmentSegment,
} from '~/integrations/storage/app/storage-key-builder';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { MinioStorageService } from '~/integrations/storage/infra/minio-storage.service';
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
  REVIEW_IMAGE_ROOT_DIRS,
  SHOPS_LOCAL_TSV_PATH,
  SHOPS_TSV_PATH,
} from '../database/seeds/product-seed-paths';
import { buildSeedReviewImageStorageKey } from '../database/seeds/review-seed-image-resolver';
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

type ResolvedProductSeedAssets = {
  assetDirectory: string | null;
  imageFilenames: string[];
};

type SeedReviewImageAsset = {
  sourceFile: string;
  storageKey: string;
};

const ROOT_DIR = path.resolve(__dirname, '../..');
const SEED_ASSETS_DIR = path.join(ROOT_DIR, 'seed-data');
const CATEGORY_ASSETS_DIR = path.join(SEED_ASSETS_DIR, 'images', 'categories');
const CATEGORY_UPLOAD_CONCURRENCY = 4;
const CATEGORY_VARIANT_CONCURRENCY = 3;
const PRODUCT_UPLOAD_CONCURRENCY = 4;
const REVIEW_UPLOAD_CONCURRENCY = 4;
const REVIEW_VARIANT_CONCURRENCY = 3;
const PRODUCT_PROCESSING_CONCURRENCY = 2;

type StorageUsageSummary = {
  objectCount: number;
  totalBytes: number;
};

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs.toFixed(0)}ms`;
  }

  return `${(durationMs / 1_000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1_024;
  let unitIndex = 0;

  while (value >= 1_024 && unitIndex < units.length - 1) {
    value /= 1_024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

async function measureStep<T>(
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  console.log(`[perf] start ${label}`);

  try {
    const result = await work();
    console.log(`[perf] done ${label} in ${formatDurationMs(performance.now() - startedAt)}`);
    return result;
  }
  catch (error) {
    console.log(`[perf] failed ${label} after ${formatDurationMs(performance.now() - startedAt)}`);
    throw error;
  }
}

function assertFileExists(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Asset file not found: ${filePath}`);
  }
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
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
    rows.map((row) => [row.shop_slug.trim(), row.shop_name.trim()]),
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
        `Product seed row ${index + 2} must include shop_slug, category_path, and title`,
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

function resolveProductSeedAssets(productSeed: MinimalProductSeed): ResolvedProductSeedAssets {
  const imageFilenames =
    productSeed.state === 'draft'
      ? resolveOptionalSeedProductImagePaths(
        PRODUCT_IMAGE_ROOT_DIRS,
        productSeed.shopSlug,
        productSeed.title,
      )
      : resolveSeedProductImagePaths(
        PRODUCT_IMAGE_ROOT_DIRS,
        productSeed.shopSlug,
        productSeed.title,
      );
  const assetDirectory =
    productSeed.state === 'draft'
      ? resolveOptionalSeedProductAssetDirectory(
        PRODUCT_IMAGE_ROOT_DIRS,
        productSeed.shopSlug,
        productSeed.title,
      )
      : resolveSeedProductAssetDirectory(
        PRODUCT_IMAGE_ROOT_DIRS,
        productSeed.shopSlug,
        productSeed.title,
      );

  return {
    assetDirectory: assetDirectory ?? null,
    imageFilenames,
  };
}

function buildSeedProductImageStorageKey(
  shop: ShopEntity,
  product: ProductEntity,
  imageFilename: string,
): string {
  const normalizedFilename = path.basename(imageFilename.trim());
  const extension = path.extname(normalizedFilename).replace(/^\./, '').toLowerCase();
  const filenameWithoutExtension = normalizedFilename.slice(
    0,
    normalizedFilename.length - extension.length - 1,
  );

  if (!extension || !filenameWithoutExtension) {
    throw new Error(`Invalid product image filename "${imageFilename}".`);
  }

  return buildStorageObjectKey({
    env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
    visibility: 'public',
    pathSegments: [
      'shops',
      shop.publicId ?? shop.id,
      'products',
      product.publicId ?? product.id,
      'images',
      filenameWithoutExtension,
    ],
    extension,
    filename: 'original',
  });
}

async function syncSeedProductImages(
  em: EntityManager,
  shop: ShopEntity,
  product: ProductEntity,
  imageFilenames: string[],
): Promise<ProductImageEntity[]> {
  for (const image of await em.find(ProductImageEntity, { product })) {
    em.remove(image);
  }
  await em.flush();

  const images = imageFilenames.map((imageFilename, index) =>
    em.create(ProductImageEntity, {
      product,
      storageKey: buildSeedProductImageStorageKey(shop, product, imageFilename),
      rank: index + 1,
      variantStatus: ProductImageVariantStatus.PENDING,
    }),
  );

  images.forEach((image) => em.persist(image));
  await em.flush();

  return images;
}

function createStorageService(config: StorageConfig): StorageService {
  return config.driver === 'local'
    ? new LocalFileStorageService(config)
    : new MinioStorageService(config);
}

async function collectStorageUsage(
  config: StorageConfig,
): Promise<StorageUsageSummary> {
  return config.driver === 'local'
    ? collectLocalStorageUsage(config)
    : collectMinioStorageUsage(config);
}

async function collectLocalStorageUsage(
  config: LocalStorageConfig,
): Promise<StorageUsageSummary> {
  const rootPath = path.resolve(config.localRoot);

  if (!existsSync(rootPath)) {
    return { objectCount: 0, totalBytes: 0 };
  }

  let objectCount = 0;
  let totalBytes = 0;

  async function walk(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const fileStat = await stat(entryPath);
      objectCount += 1;
      totalBytes += fileStat.size;
    }
  }

  await walk(rootPath);

  return { objectCount, totalBytes };
}

async function collectMinioStorageUsage(
  config: MinioStorageConfig,
): Promise<StorageUsageSummary> {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  let objectCount = 0;
  let totalBytes = 0;
  let continuationToken: string | undefined;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      ContinuationToken: continuationToken,
    }));

    for (const object of response.Contents ?? []) {
      if (!object.Key) {
        continue;
      }

      objectCount += 1;
      totalBytes += object.Size ?? 0;
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return { objectCount, totalBytes };
}

async function putSeedAsset(
  storageService: StorageService,
  key: string,
  sourceFile: string,
): Promise<void> {
  assertFileExists(sourceFile);

  await storageService.putObject({
    key,
    body: await readFile(sourceFile),
    contentType: resolveContentType(sourceFile),
  });
}

async function putCategorySeedVariants(
  storageService: StorageService,
  imageTransformService: SharpImageTransformService,
  originalKey: string,
  sourceFile: string,
): Promise<void> {
  const original = await readFile(sourceFile);

  const variantEntries = Object.entries(CATEGORY_IMAGE_VARIANT_SPECS) as Array<
    [CategoryImageVariant, (typeof CATEGORY_IMAGE_VARIANT_SPECS)[CategoryImageVariant]]
  >;

  await mapWithConcurrency(
    variantEntries,
    CATEGORY_VARIANT_CONCURRENCY,
    async ([variant, spec]) => {
      const transformed = await imageTransformService.transform(original, spec);
      const key = buildCategoryVariantStorageKey(originalKey, variant);

      await storageService.putObject({
        key,
        body: transformed,
        contentType: resolveImageVariantContentType(spec.format),
      });
      console.log(`Uploaded category asset variant -> ${key}`);
    },
  );
}

function buildCategoryVariantStorageKey(
  originalKey: string,
  variant: CategoryImageVariant,
): string {
  const segments = originalKey.split('/').filter(Boolean);
  const imageSegmentIndex = segments.lastIndexOf('images');
  const originalSegment = segments[imageSegmentIndex + 1];

  if (imageSegmentIndex === -1 || originalSegment !== 'original') {
    throw new Error(`Unsupported category image storage key "${originalKey}".`);
  }

  return [
    ...segments.slice(0, imageSegmentIndex + 1),
    'variants',
    `${variant}.webp`,
  ].join('/');
}

function resolveImageVariantContentType(
  format: 'webp' | 'jpg' | 'png' | 'avif',
): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'avif':
      return 'image/avif';
  }
}

async function collectSeedReviewImageAssets(
  rootDirs: readonly string[],
): Promise<SeedReviewImageAsset[]> {
  const assetsByStorageKey = new Map<string, SeedReviewImageAsset>();

  for (const rootDir of rootDirs) {
    if (!existsSync(rootDir)) {
      continue;
    }

    const shopEntries = await readdir(rootDir, { withFileTypes: true });

    for (const shopEntry of shopEntries) {
      if (!shopEntry.isDirectory() || shopEntry.name.startsWith('.')) {
        continue;
      }

      const shopDir = path.join(rootDir, shopEntry.name);
      const productEntries = await readdir(shopDir, { withFileTypes: true });

      for (const productEntry of productEntries) {
        if (!productEntry.isDirectory() || productEntry.name.startsWith('.')) {
          continue;
        }

        const productDir = path.join(shopDir, productEntry.name);
        const reviewerEntries = await readdir(productDir, { withFileTypes: true });

        for (const reviewerEntry of reviewerEntries) {
          if (!reviewerEntry.isDirectory() || reviewerEntry.name.startsWith('.')) {
            continue;
          }

          const reviewerDir = path.join(productDir, reviewerEntry.name);
          const imageEntries = await readdir(reviewerDir, { withFileTypes: true });

          for (const imageEntry of imageEntries) {
            if (!imageEntry.isFile() || imageEntry.name.startsWith('.')) {
              continue;
            }

            const extension = path.extname(imageEntry.name).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
              continue;
            }

            const relativeImagePath = path.posix.join(
              shopEntry.name,
              productEntry.name,
              reviewerEntry.name,
              imageEntry.name,
            );

            const asset = {
              sourceFile: path.join(reviewerDir, imageEntry.name),
              storageKey: buildSeedReviewImageStorageKey(
                shopEntry.name,
                productEntry.name,
                reviewerEntry.name,
                relativeImagePath,
              ),
            };

            if (!assetsByStorageKey.has(asset.storageKey)) {
              assetsByStorageKey.set(asset.storageKey, asset);
            }
          }
        }
      }
    }
  }

  return Array.from(assetsByStorageKey.values())
    .sort((left, right) => left.sourceFile.localeCompare(right.sourceFile));
}

async function main(): Promise<void> {
  const scriptStartedAt = performance.now();
  const env = validateAppEnv(process.env);
  const storageConfig = buildStorageConfig({
    get: ((key: string | symbol, defaultValue?: unknown) =>
      env[key as string] ?? defaultValue) as never,
  });
  const storageService = createStorageService(storageConfig);

  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env),
    entities: [
      CategoryEntity,
      ShopEntity,
      ProductEntity,
      ProductImageEntity,
      ProductImageVariantEntity,
      ProductReviewImageEntity,
      ProductReviewImageVariantEntity,
    ],
  });

  try {
    const em = orm.em.fork();
    const imageTransformService = new SharpImageTransformService();
    const productImageVariantGenerationRepository = new MikroOrmProductImageVariantGenerationRepository(
      orm.em,
    );
    const reviewImageVariantGenerationRepository = new MikroOrmReviewImageVariantGenerationRepository(
      orm.em,
    );
    const productImageService = new ProductImageService(
      productImageVariantGenerationRepository,
      storageService,
      imageTransformService,
    );
    const reviewImageService = new ReviewImageService(
      reviewImageVariantGenerationRepository,
      storageService,
      imageTransformService,
    );
    const shopNamesBySlug = loadShopNamesBySlug();
    const productSeeds = loadProductSeedsMinimal();
    let categories: CategoryEntity[];

    try {
      categories = await em.find(
        CategoryEntity,
        { imageStorageKey: { $ne: null } },
      );
    }
    catch (error) {
      if (error instanceof TableNotFoundException) {
        throw new Error(
          'Seed tables not found. Run "just db-seed" or "just db-seed-demo" before "just storage-seed".',
        );
      }

      throw error;
    }

    const categoriesWithImages = categories.filter((category) => category.imageStorageKey);
    console.log(
      `[perf] category_count=${categoriesWithImages.length} category_upload_concurrency=${CATEGORY_UPLOAD_CONCURRENCY} category_variant_concurrency=${CATEGORY_VARIANT_CONCURRENCY}`,
    );

    await measureStep('upload categories', async () =>
      mapWithConcurrency(
        categoriesWithImages,
        CATEGORY_UPLOAD_CONCURRENCY,
        async (category) => {
          const imageStorageKey = category.imageStorageKey;
          if (!imageStorageKey) {
            return;
          }

          const sourceFile = path.join(
            CATEGORY_ASSETS_DIR,
            path.basename(imageStorageKey),
          );

          await putSeedAsset(storageService, imageStorageKey, sourceFile);
          console.log(`Uploaded category asset -> ${imageStorageKey}`);
          await putCategorySeedVariants(
            storageService,
            imageTransformService,
            imageStorageKey,
            sourceFile,
          );
        },
      ),
    );

    console.log(
      `[perf] product_count=${productSeeds.length} product_processing_concurrency=${PRODUCT_PROCESSING_CONCURRENCY} product_upload_concurrency=${PRODUCT_UPLOAD_CONCURRENCY}`,
    );

    await measureStep('process products', async () =>
      mapWithConcurrency(
        productSeeds,
        PRODUCT_PROCESSING_CONCURRENCY,
        async (productSeed) => {
          const { assetDirectory, imageFilenames } = resolveProductSeedAssets(productSeed);
          if (!assetDirectory && imageFilenames.length === 0) {
            console.log(
              `[perf] skip assetless seed ${productSeed.shopSlug}/${slugifySeedValue(productSeed.title)}`,
            );
            return;
          }

          const shopName = shopNamesBySlug.get(productSeed.shopSlug);
          if (!shopName) {
            throw new Error(`Missing shop seed mapping for slug: ${productSeed.shopSlug}`);
          }

          const shop = await em.findOne(ShopEntity, { shopName });
          if (!shop) {
            throw new Error(
              `Missing seeded shop: ${shopName}. Run the database seed first with "just db-seed" (or "just db-seed-demo"), then rerun "just storage-seed".`,
            );
          }

          const product = await em.findOne(
            ProductEntity,
            { shop, slug: slugifySeedValue(productSeed.title) },
            { populate: ['images', 'images.variants'] },
          );

          if (!product) {
            throw new Error(
              `Missing seeded product: ${productSeed.title}. Run the database seed first with "just db-seed" (or "just db-seed-demo"), then rerun "just storage-seed".`,
            );
          }

          let images = product.images
            .getItems()
            .sort((leftImage, rightImage) => leftImage.rank - rightImage.rank);

          if (images.length !== imageFilenames.length) {
            console.warn(
              `Reconciling seeded product images for "${productSeed.title}" (${images.length} database rows vs ${imageFilenames.length} seed assets).`,
            );
            images = await syncSeedProductImages(em, shop, product, imageFilenames);
          }

          if (!assetDirectory) {
            throw new Error(
              `Missing product asset directory for seeded product "${productSeed.title}".`,
            );
          }

          await measureStep(`upload originals for ${product.slug}`, async () =>
            mapWithConcurrency(
              images,
              PRODUCT_UPLOAD_CONCURRENCY,
              async (image, index) => {
                const imageFilename = imageFilenames[index];
                if (!imageFilename) {
                  throw new Error(
                    `Missing source image filename for seeded product "${productSeed.title}" at index ${index}.`,
                  );
                }

                const sourceFile = path.join(
                  assetDirectory,
                  path.basename(imageFilename),
                );

                await putSeedAsset(storageService, image.storageKey, sourceFile);
                console.log(`Uploaded product asset -> ${image.storageKey}`);
              },
            ),
          );

          await measureStep(
            `generate variants for ${product.slug}`,
            async () => productImageService.generateVariants(product.id),
          );
          console.log(`Generated product image variants -> ${product.slug}`);
        },
      ),
    );

    const reviewImageAssets = await measureStep(
      'scan review image assets',
      async () => collectSeedReviewImageAssets(REVIEW_IMAGE_ROOT_DIRS),
    );
    console.log(
      `[perf] review_image_count=${reviewImageAssets.length} review_upload_concurrency=${REVIEW_UPLOAD_CONCURRENCY} review_variant_concurrency=${REVIEW_VARIANT_CONCURRENCY}`,
    );

    await measureStep('upload review images', async () =>
      mapWithConcurrency(
        reviewImageAssets,
        REVIEW_UPLOAD_CONCURRENCY,
        async (asset) => {
          await putSeedAsset(storageService, asset.storageKey, asset.sourceFile);
          console.log(`Uploaded review asset -> ${asset.storageKey}`);
        },
      ),
    );

    const reviewImageStorageKeys = reviewImageAssets.map((asset) => asset.storageKey);
    const reviewImages = reviewImageStorageKeys.length > 0
      ? await em.find(
        ProductReviewImageEntity,
        {
          storageKey: { $in: reviewImageStorageKeys },
        },
        {
          fields: ['id', 'storageKey'],
          orderBy: { createdAt: 'asc' },
        },
      )
      : [];

    await measureStep('generate review image variants', async () =>
      mapWithConcurrency(
        reviewImages,
        REVIEW_VARIANT_CONCURRENCY,
        async (reviewImage) => {
          await reviewImageService.generateVariants(reviewImage.id);
          console.log(`Generated review image variants -> ${reviewImage.storageKey}`);
        },
      ),
    );
  }
  finally {
    await orm.close(true);
  }

  const storageUsage = await measureStep(
    'measure storage usage',
    async () => collectStorageUsage(storageConfig),
  );
  console.log(
    `[perf] storage_usage objects=${storageUsage.objectCount} total_size=${formatBytes(storageUsage.totalBytes)} (${storageUsage.totalBytes} bytes)`,
  );
  console.log(`[perf] total script time ${formatDurationMs(performance.now() - scriptStartedAt)}`);
  console.log('Seed asset upload complete.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
