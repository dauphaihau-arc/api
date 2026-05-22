import 'reflect-metadata';
import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchBucket,
  S3Client,
} from '@aws-sdk/client-s3';

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

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: storageConfig.bucket,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      if (object.Key) {
        keys.push(object.Key);
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  if (keys.length === 0) {
    console.log(`No storage objects found to clear in bucket ${storageConfig.bucket}`);
    return;
  }

  const objects = keys.map((key) => ({ Key: key }));
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
    `Storage objects cleared (${objects.length}) from bucket ${storageConfig.bucket}`
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
