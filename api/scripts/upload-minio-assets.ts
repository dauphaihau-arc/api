import 'reflect-metadata';
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '../src/config/database.config';
import { CategoryEntity } from '../src/modules/domains/category/infra/persistence/entities/category.entity';
import { PRODUCT_IMAGE_VARIANT_SPECS } from '../src/modules/domains/product/app/config/product-image-variant.config';
import { ProductImageVariant } from '../src/modules/domains/product/domain/enums/product-image-variant.enum';
import { ProductImageEntity } from '../src/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductImageVariantEntity } from '../src/modules/domains/product/infra/persistence/entities/product-image-variant.entity';
import { ProductEntity } from '../src/modules/domains/product/infra/persistence/entities/product.entity';
import { ShopEntity } from '../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { SharpImageTransformService } from '../src/modules/shared/image/infra/sharp-image-transform.service';
import { buildStorageObjectKey, resolveStorageEnvironmentSegment } from '../src/modules/shared/storage/app/storage-key-builder';
import {
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
};

type ProductCsvRow = {
  shop_slug: string;
  category_path: string;
  title: string;
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

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function uploadObject(
  client: S3Client,
  bucket: string,
  key: string,
  filePath: string
): Promise<void> {
  assertFileExists(filePath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: resolveContentType(filePath),
    })
  );
}

async function uploadBuffer(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    })
  );
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
    };
  });
}

async function main(): Promise<void> {
  const storageDriver = process.env.STORAGE_DRIVER ?? 'local';

  if (storageDriver === 'local') {
    throw new Error(
      'STORAGE_DRIVER=local is not supported for upload-assets. Use object storage config.'
    );
  }

  const storageConfig = {
    driver: 'minio' as const,
    endpoint:
      process.env.STORAGE_OBJECT_STORAGE_ENDPOINT ??
      process.env.STORAGE_MINIO_ENDPOINT ??
      '',
    region:
      process.env.STORAGE_OBJECT_STORAGE_REGION ??
      process.env.STORAGE_MINIO_REGION ??
      'us-east-1',
    bucket:
      process.env.STORAGE_OBJECT_STORAGE_BUCKET ??
      process.env.STORAGE_MINIO_BUCKET ??
      '',
    accessKey:
      process.env.STORAGE_OBJECT_STORAGE_ACCESS_KEY ??
      process.env.STORAGE_MINIO_ACCESS_KEY ??
      '',
    secretKey:
      process.env.STORAGE_OBJECT_STORAGE_SECRET_KEY ??
      process.env.STORAGE_MINIO_SECRET_KEY ??
      '',
    forcePathStyle:
      (
        process.env.STORAGE_OBJECT_STORAGE_FORCE_PATH_STYLE ??
        process.env.STORAGE_MINIO_FORCE_PATH_STYLE ??
        'true'
      ) === 'true',
  };

  if (!storageConfig.endpoint || !storageConfig.bucket) {
    throw new Error(
      'Missing object storage configuration. Expected endpoint and bucket env vars.'
    );
  }

  const client = new S3Client({
    region: storageConfig.region,
    endpoint: storageConfig.endpoint,
    forcePathStyle: storageConfig.forcePathStyle,
    credentials: {
      accessKeyId: storageConfig.accessKey,
      secretAccessKey: storageConfig.secretKey,
    },
  });

  const imageTransformService = new SharpImageTransformService();

  await ensureBucket(client, storageConfig.bucket);

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
    const shopNamesBySlug = loadShopNamesBySlug();
    const productSeeds = loadProductSeedsMinimal();

    const categories = await em.find(
      CategoryEntity,
      { imageStorageKey: { $ne: null } }
    );

    for (const category of categories) {
      if (!category.imageStorageKey) {
        continue;
      }

      const sourceFile = path.join(
        CATEGORY_ASSETS_DIR,
        path.basename(category.imageStorageKey)
      );

      await uploadObject(client, storageConfig.bucket, category.imageStorageKey, sourceFile);
      console.log(`Uploaded category asset -> ${category.imageStorageKey}`);
    }

    for (const productSeed of productSeeds) {
      const shopName = shopNamesBySlug.get(productSeed.shopSlug);
      if (!shopName) {
        throw new Error(`Missing shop seed mapping for slug: ${productSeed.shopSlug}`);
      }

      const imageFilenames = resolveSeedProductImagePaths(
        PRODUCT_IMAGE_ROOT_DIRS,
        productSeed.shopSlug,
        productSeed.title
      );
      const assetDirectory = resolveSeedProductAssetDirectory(
        PRODUCT_IMAGE_ROOT_DIRS,
        productSeed.shopSlug,
        productSeed.title
      );

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

      const images = product.images.getItems().sort((a, b) => a.rank - b.rank);

      if (images.length !== imageFilenames.length) {
        throw new Error(
          `Image count mismatch for seeded product "${productSeed.title}".`
        );
      }

      for (const [index, image] of images.entries()) {
        const sourceFile = path.join(
          assetDirectory,
          path.basename(imageFilenames[index])
        );
        const sourceBuffer = await readFile(sourceFile);

        await uploadObject(client, storageConfig.bucket, image.storageKey, sourceFile);
        console.log(`Uploaded product asset -> ${image.storageKey}`);

        for (const [variant, spec] of Object.entries(PRODUCT_IMAGE_VARIANT_SPECS) as Array<
          [ProductImageVariant, (typeof PRODUCT_IMAGE_VARIANT_SPECS)[ProductImageVariant]]
        >) {
          if (!spec) {
            continue;
          }

          const transformed = await imageTransformService.transform(sourceBuffer, spec);
          const variantKey = buildStorageObjectKey({
            env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
            visibility: 'public',
            path: [
              { domain: 'shops', id: shop.publicId },
              { domain: 'products', id: product.publicId },
            ],
            collection: 'images',
            assetPath: [resolveProductImageStorageId(image.storageKey)],
            extension: spec.format,
            filename: variant,
          });

          await uploadBuffer(
            client,
            storageConfig.bucket,
            variantKey,
            transformed,
            resolveVariantContentType(spec.format)
          );

          const existingVariant = image.variants
            .getItems()
            .find((candidate) => candidate.variant === variant);

          if (existingVariant) {
            existingVariant.storageKey = variantKey;
            existingVariant.width = spec.width;
            existingVariant.height = spec.height;
            existingVariant.format = spec.format;
            em.persist(existingVariant);
          }
          else {
            em.persist(em.create(ProductImageVariantEntity, {
              image,
              variant,
              storageKey: variantKey,
              width: spec.width,
              height: spec.height,
              format: spec.format,
            }));
          }

          console.log(`Uploaded product asset variant -> ${variantKey}`);
        }
      }
    }

    await em.flush();
  } finally {
    await orm.close(true);
  }

  console.log('Seed asset upload complete.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function resolveVariantContentType(format: 'webp' | 'jpg' | 'png' | 'avif'): string {
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

function resolveProductImageStorageId(storageKey: string): string {
  const segments = storageKey.split('/').filter(Boolean);
  const imageId = segments.at(-2);

  if (!imageId) {
    throw new Error(`Unable to resolve product image storage id from key "${storageKey}".`);
  }

  return imageId;
}
