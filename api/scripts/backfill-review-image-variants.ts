import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { buildStorageConfig } from '~/platform/config/storage.config';
import { ReviewImageService } from '~/domains/product/app/services/review-image.service';
import { ProductReviewImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review-image.entity';
import { ProductReviewImageVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review-image-variant.entity';
import { MikroOrmReviewImageVariantGenerationRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-review-image-variant-generation.repository';
import { SharpImageTransformService } from '~/integrations/image-transform/infra/sharp-image-transform.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { MinioStorageService } from '~/integrations/storage/infra/minio-storage.service';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';

const REVIEW_VARIANT_CONCURRENCY = 3;

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let currentIndex = 0;

  async function runWorker() {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;

      if (index >= items.length) {
        return;
      }

      await worker(items[index]!, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => runWorker()),
  );
}

function createStorageService(): StorageService {
  const configService = {
    get<TValue extends string | undefined>(key: string, defaultValue?: TValue): TValue {
      return (process.env[key] as TValue | undefined) ?? defaultValue as TValue;
    },
  };
  const storageConfig = buildStorageConfig(configService);

  return storageConfig.driver === 'minio'
    ? new MinioStorageService(storageConfig)
    : new LocalFileStorageService(storageConfig);
}

async function main(): Promise<void> {
  console.log('Starting review image variant backfill');
  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env),
    entities: [
      ProductReviewImageEntity,
      ProductReviewImageVariantEntity,
    ],
  });

  try {
    const reviewImages = await orm.em.fork().find(
      ProductReviewImageEntity,
      {},
      {
        fields: ['id', 'storageKey'],
        orderBy: { createdAt: 'asc' },
      },
    );

    console.log(
      `Found ${reviewImages.length} review images; processing with concurrency ${REVIEW_VARIANT_CONCURRENCY}`,
    );

    const reviewImageService = new ReviewImageService(
      new MikroOrmReviewImageVariantGenerationRepository(orm.em),
      createStorageService(),
      new SharpImageTransformService(),
    );

    let processed = 0;

    await mapWithConcurrency(
      reviewImages,
      REVIEW_VARIANT_CONCURRENCY,
      async (reviewImage, index) => {
        await reviewImageService.generateVariants(reviewImage.id);
        processed += 1;
        console.log(
          `Backfilled ${processed}/${reviewImages.length} -> ${reviewImage.storageKey} (${index + 1})`,
        );
      },
    );

    console.log(`Review image variant backfill complete: ${processed}/${reviewImages.length}`);
  }
  finally {
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
