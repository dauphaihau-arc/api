import 'reflect-metadata';
import { createReadStream, existsSync } from 'node:fs';
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
import { ProductImageEntity } from '../src/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductEntity } from '../src/modules/domains/product/infra/persistence/entities/product.entity';
import { ShopEntity } from '../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { productSeeds } from '../database/seeds/product.data';
import {
  resolveSeedProductImagePaths,
  slugifySeedValue,
} from '../database/seeds/product-seed-image-resolver';

const ROOT_DIR = path.resolve(__dirname, '../..');
const SEED_ASSETS_DIR = path.join(ROOT_DIR, 'seed-assets');
const CATEGORY_ASSETS_DIR = path.join(SEED_ASSETS_DIR, 'categories');
const PRODUCT_ASSETS_DIR = path.join(SEED_ASSETS_DIR, 'products');

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

  await ensureBucket(client, storageConfig.bucket);

  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env),
    entities: [CategoryEntity, ShopEntity, ProductEntity, ProductImageEntity],
  });

  try {
    const em = orm.em.fork();

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
      const imageFilenames = resolveSeedProductImagePaths(
        PRODUCT_ASSETS_DIR,
        productSeed.shopName,
        productSeed.title
      );

      const shop = await em.findOne(ShopEntity, { shopName: productSeed.shopName });
      if (!shop) {
        throw new Error(
          `Missing seeded shop: ${productSeed.shopName}. Run the database seed first with "just api-seed" (or the combined recipe "just seed-with-assets"), then rerun "just upload-assets".`
        );
      }

      const product = await em.findOne(
        ProductEntity,
        { shop, slug: slugifySeedValue(productSeed.title) },
        { populate: ['images'] }
      );

      if (!product) {
        throw new Error(
          `Missing seeded product: ${productSeed.title}. Run the database seed first with "just api-seed" (or the combined recipe "just seed-with-assets"), then rerun "just upload-assets".`
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
          PRODUCT_ASSETS_DIR,
          imageFilenames[index]
        );

        await uploadObject(client, storageConfig.bucket, image.storageKey, sourceFile);
        console.log(`Uploaded product asset -> ${image.storageKey}`);
      }
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
