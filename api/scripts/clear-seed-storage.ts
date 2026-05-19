import 'reflect-metadata';
import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  NoSuchBucket,
  S3Client,
} from '@aws-sdk/client-s3';
import { TableNotFoundException } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/postgresql';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { buildDatabaseConfig } from '../src/config/database.config';
import { CategoryEntity } from '../src/modules/domains/category/infra/persistence/entities/category.entity';
import { ProductImageEntity } from '../src/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductEntity } from '../src/modules/domains/product/infra/persistence/entities/product.entity';
import { ShopEntity } from '../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { slugifySeedValue } from '../database/seeds/product-seed-image-resolver';
import { readTsvRows } from '../database/seeds/shared/read-tsv-rows';

type ShopCsvRow = {
  shop_slug: string;
  shop_name: string;
};

type MinimalProductSeed = {
  shopSlug: string;
  title: string;
};

function buildStorageConfig() {
  const driver = process.env.STORAGE_DRIVER ?? 'local';

  if (driver === 'local') {
    throw new Error(
      'STORAGE_DRIVER=local is not supported for storage-clear. Use object storage config.'
    );
  }

  const endpoint =
    process.env.STORAGE_OBJECT_STORAGE_ENDPOINT
    ?? process.env.STORAGE_MINIO_ENDPOINT
    ?? '';
  const bucket =
    process.env.STORAGE_OBJECT_STORAGE_BUCKET
    ?? process.env.STORAGE_MINIO_BUCKET
    ?? '';

  if (!endpoint || !bucket) {
    throw new Error(
      'Missing object storage configuration. Expected endpoint and bucket env vars.'
    );
  }

  return {
    endpoint,
    bucket,
    region:
      process.env.STORAGE_OBJECT_STORAGE_REGION
      ?? process.env.STORAGE_MINIO_REGION
      ?? 'us-east-1',
    accessKey:
      process.env.STORAGE_OBJECT_STORAGE_ACCESS_KEY
      ?? process.env.STORAGE_MINIO_ACCESS_KEY
      ?? '',
    secretKey:
      process.env.STORAGE_OBJECT_STORAGE_SECRET_KEY
      ?? process.env.STORAGE_MINIO_SECRET_KEY
      ?? '',
    forcePathStyle:
      (
        process.env.STORAGE_OBJECT_STORAGE_FORCE_PATH_STYLE
        ?? process.env.STORAGE_MINIO_FORCE_PATH_STYLE
        ?? 'true'
      ) === 'true',
  };
}

async function bucketExists(client: S3Client, bucket: string): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    if (error instanceof NoSuchBucket) {
      return false;
    }

    const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
    if (metadata?.httpStatusCode === 404) {
      return false;
    }

    throw error;
  }
}

function loadShopNamesBySlug(): Map<string, string> {
  const rows = readTsvRows<ShopCsvRow>(
    path.resolve(__dirname, '../../seed-data/shops.tsv')
  );

  return new Map(
    rows.map((row) => [row.shop_slug.trim(), row.shop_name.trim()])
  );
}

function loadProductSeedsMinimal(): MinimalProductSeed[] {
  const filePath = path.resolve(__dirname, '../../seed-data/products.tsv');
  const lines = readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

  return lines.slice(1).map((line, index) => {
    const columns = line.split('\t');
    if (columns.length < 3) {
      throw new Error(
        `products.tsv row ${index + 2} must include at least shop_slug, category_path, and title`
      );
    }

    return {
      shopSlug: columns[0].trim(),
      title: columns[2].trim(),
    };
  });
}

async function main(): Promise<void> {
  const storageConfig = buildStorageConfig();
  const client = new S3Client({
    region: storageConfig.region,
    endpoint: storageConfig.endpoint,
    forcePathStyle: storageConfig.forcePathStyle,
    credentials: {
      accessKeyId: storageConfig.accessKey,
      secretAccessKey: storageConfig.secretKey,
    },
  });

  const hasBucket = await bucketExists(client, storageConfig.bucket);
  if (!hasBucket) {
    console.log(`Storage bucket not found, nothing to clear: ${storageConfig.bucket}`);
    return;
  }

  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env),
    entities: [CategoryEntity, ShopEntity, ProductEntity, ProductImageEntity],
  });

  try {
    const em = orm.em.fork();
    const keys = new Set<string>();
    const shopNamesBySlug = loadShopNamesBySlug();
    const productSeeds = loadProductSeedsMinimal();
    let categories: Array<{ imageStorageKey?: string | null }>;

    try {
      categories = await em.find(
        CategoryEntity,
        { imageStorageKey: { $ne: null } },
        { fields: ['imageStorageKey'] }
      );
    } catch (error) {
      if (error instanceof TableNotFoundException) {
        console.log('Seed tables not found, nothing to clear from storage');
        return;
      }

      throw error;
    }

    for (const category of categories) {
      if (category.imageStorageKey) {
        keys.add(category.imageStorageKey);
      }
    }

    for (const productSeed of productSeeds) {
      const shopName = shopNamesBySlug.get(productSeed.shopSlug);
      if (!shopName) {
        continue;
      }

      const shop = await em.findOne(
        ShopEntity,
        { shopName },
        { fields: ['id'] }
      );

      if (!shop) {
        continue;
      }

      const product = await em.findOne(
        ProductEntity,
        { shop, slug: slugifySeedValue(productSeed.title) },
        { populate: ['images'] }
      );

      if (!product) {
        continue;
      }

      for (const image of product.images.getItems()) {
        keys.add(image.storageKey);
      }
    }

    if (keys.size === 0) {
      console.log('No seeded storage objects found to clear');
      return;
    }

    const objects = Array.from(keys).map((key) => ({ Key: key }));
    const batchSize = 1000;

    for (let index = 0; index < objects.length; index += batchSize) {
      const batch = objects.slice(index, index + batchSize);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: storageConfig.bucket,
          Delete: {
            Objects: batch,
            Quiet: false,
          },
        })
      );
    }

    console.log(
      `Seeded storage objects cleared (${objects.length}) from bucket ${storageConfig.bucket}`
    );
  } finally {
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
