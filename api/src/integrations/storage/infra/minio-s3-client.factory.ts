import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { MinioStorageConfig } from '~/platform/config/storage.config';

const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 5;

/**
 * Creates the S3 client used for object storage.
 *
 * Keep-alive is disabled on purpose: long-running bulk uploads leave pooled
 * sockets idle long enough for the remote endpoint (and proxies in front of it)
 * to close them silently. Reusing such a socket fails with `ECONNRESET`
 * "socket hang up", and SDK retries keep picking the same dead sockets.
 * Opening a fresh connection per request removes that failure mode.
 */
export function createMinioS3Client(config: MinioStorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    maxAttempts: MAX_ATTEMPTS,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      httpAgent: new HttpAgent({ keepAlive: false }),
      httpsAgent: new HttpsAgent({ keepAlive: false }),
    }),
  });
}
