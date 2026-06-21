import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  NoSuchKey,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { MinioStorageConfig } from '~/config/storage.config';
import type { StorageService } from '../app/ports/storage.service';
import type { PutStorageObjectInput, StoredObject } from '../app/storage.types';
import { normalizeStorageKey } from './storage-key.util';

interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

export class MinioStorageService implements StorageService {
  private readonly client: S3ClientLike;
  private bucketReadyPromise?: Promise<void>;

  constructor(
    private readonly storageConfig: MinioStorageConfig,
    client?: S3ClientLike,
  ) {
    this.client = client ?? new S3Client({
      region: this.storageConfig.region,
      endpoint: this.storageConfig.endpoint,
      forcePathStyle: this.storageConfig.forcePathStyle,
      credentials: {
        accessKeyId: this.storageConfig.accessKey,
        secretAccessKey: this.storageConfig.secretKey,
      },
    });
  }

  async putObject(input: PutStorageObjectInput): Promise<StoredObject> {
    await this.ensureBucket();

    const normalizedKey = normalizeStorageKey(input.key);
    const body = this.toBuffer(input.body);

    await this.client.send(new PutObjectCommand({
      Bucket: this.storageConfig.bucket,
      Key: normalizedKey,
      Body: body,
      ContentType: input.contentType,
      ContentLength: body.byteLength,
    }));

    return {
      key: normalizedKey,
      size: body.byteLength,
      contentType: input.contentType,
      url: this.getPublicUrl(normalizedKey),
    };
  }

  async getObject(key: string): Promise<Buffer> {
    await this.ensureBucket();

    const normalizedKey = normalizeStorageKey(key);
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.storageConfig.bucket,
      Key: normalizedKey,
    }));

    return this.readBodyAsBuffer((response as { Body?: unknown }).Body);
  }

  async deleteObject(key: string): Promise<void> {
    await this.ensureBucket();

    const normalizedKey = normalizeStorageKey(key);

    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: normalizedKey,
      }));
    }
    catch (error) {
      if (this.isMissingObjectError(error)) {
        return;
      }

      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureBucket();

    const normalizedKey = normalizeStorageKey(key);

    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.storageConfig.bucket,
        Key: normalizedKey,
      }));
      return true;
    }
    catch (error) {
      if (this.isMissingObjectError(error)) {
        return false;
      }

      throw error;
    }
  }

  getPublicUrl(key: string): string | undefined {
    const normalizedKey = normalizeStorageKey(key);

    if (!this.storageConfig.publicBaseUrl) {
      return undefined;
    }

    const baseUrl = this.storageConfig.publicBaseUrl.replace(/\/+$/, '');
    const encodedKey = normalizedKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${baseUrl}/${encodedKey}`;
  }

  async ping(): Promise<void> {
    await this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    if (!this.bucketReadyPromise) {
      this.bucketReadyPromise = this.ensureBucketInternal()
        .catch((error) => {
          this.bucketReadyPromise = undefined;
          throw error;
        });
    }

    await this.bucketReadyPromise;
  }

  private async ensureBucketInternal(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({
        Bucket: this.storageConfig.bucket,
      }));
      await this.ensurePublicReadPolicy();
      return;
    }
    catch (error) {
      if (!this.isMissingBucketError(error)) {
        throw error;
      }
    }

    try {
      await this.client.send(new CreateBucketCommand({
        Bucket: this.storageConfig.bucket,
      }));
    }
    catch (error) {
      if (this.isBucketAlreadyExistsError(error)) {
        return;
      }

      throw error;
    }

    await this.client.send(new HeadBucketCommand({
      Bucket: this.storageConfig.bucket,
    }));
    await this.ensurePublicReadPolicy();
  }

  private async ensurePublicReadPolicy(): Promise<void> {
    if (!this.storageConfig.publicBaseUrl) {
      return;
    }

    try {
      await this.client.send(new PutBucketPolicyCommand({
        Bucket: this.storageConfig.bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'PublicReadObjects',
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [
                `arn:aws:s3:::${this.storageConfig.bucket}/*`,
              ],
            },
          ],
        }),
      }));
    }
    catch (error) {
      if (this.isUnsupportedBucketPolicyError(error)) {
        return;
      }

      throw error;
    }
  }

  private isMissingBucketError(error: unknown): boolean {
    return (
      error instanceof S3ServiceException
      && error.$metadata.httpStatusCode === 404
    )
      || (
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && error.name === 'NotFound'
      );
  }

  private isBucketAlreadyExistsError(error: unknown): boolean {
    return error instanceof BucketAlreadyExists
      || error instanceof BucketAlreadyOwnedByYou
      || (
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && (
          error.name === 'BucketAlreadyExists'
          || error.name === 'BucketAlreadyOwnedByYou'
        )
      );
  }

  private isMissingObjectError(error: unknown): boolean {
    return error instanceof NoSuchKey
      || (
        error instanceof S3ServiceException
        && error.$metadata.httpStatusCode === 404
      )
      || (
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && error.name === 'NotFound'
      );
  }

  private isUnsupportedBucketPolicyError(error: unknown): boolean {
    return (
      error instanceof S3ServiceException
      && error.$metadata.httpStatusCode === 501
    ) || (
      typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'NotImplemented'
      && this.getHttpStatusCode(error) === 501
    );
  }

  private getHttpStatusCode(error: object): number | undefined {
    if (!('$metadata' in error)) {
      return undefined;
    }

    const metadata = error.$metadata;

    if (typeof metadata !== 'object' || metadata === null) {
      return undefined;
    }

    if (!('httpStatusCode' in metadata)) {
      return undefined;
    }

    return typeof metadata.httpStatusCode === 'number'
      ? metadata.httpStatusCode
      : undefined;
  }

  private async readBodyAsBuffer(body: unknown): Promise<Buffer> {
    if (!body) {
      throw new Error('Storage object body is empty.');
    }

    if (
      typeof body === 'object'
      && body !== null
      && 'transformToByteArray' in body
      && typeof body.transformToByteArray === 'function'
    ) {
      const bytes = await body.transformToByteArray();
      return Buffer.from(bytes);
    }

    if (body instanceof Readable) {
      const chunks: Uint8Array[] = [];

      for await (const chunk of body) {
        chunks.push(
          typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk),
        );
      }

      return Buffer.concat(chunks);
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body);
    }

    if (typeof body === 'string') {
      return Buffer.from(body);
    }

    throw new Error('Unsupported storage object body.');
  }

  private toBuffer(body: Buffer | Uint8Array | string): Buffer {
    if (typeof body === 'string') {
      return Buffer.from(body);
    }

    return Buffer.from(body);
  }
}
