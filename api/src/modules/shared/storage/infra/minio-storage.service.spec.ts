import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3ServiceException
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { MinioStorageService } from './minio-storage.service';

describe('MinioStorageService', () => {
  function createService(send = jest.fn()) {
    return {
      send,
      service: new MinioStorageService({
        driver: 'minio',
        endpoint: 'http://127.0.0.1:9000',
        region: 'us-east-1',
        bucket: 'app-files',
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
        forcePathStyle: true,
        publicBaseUrl: 'http://127.0.0.1:9000/app-files/',
      }, {
        send,
      }),
    };
  }

  it('uploads objects and returns their metadata', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await service.putObject({
      key: 'avatars/user-1.txt',
      body: 'hello storage',
      contentType: 'text/plain',
    });

    expect(send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    expect(result).toEqual({
      key: 'avatars/user-1.txt',
      size: 13,
      contentType: 'text/plain',
      url: 'http://127.0.0.1:9000/app-files/avatars/user-1.txt',
    });
  });

  it('reads object bodies from sdk streams', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: Readable.from([Buffer.from('hello '), Buffer.from('minio')]),
      });

    await expect(service.getObject('docs/report.txt')).resolves.toEqual(
      Buffer.from('hello minio')
    );
    expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
  });

  it('maps missing objects to false for exists', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new S3ServiceException({
        name: 'NotFound',
        $metadata: {
          httpStatusCode: 404,
        },
      }));

    await expect(service.exists('missing.txt')).resolves.toBe(false);
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });

  it('deletes objects idempotently', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new S3ServiceException({
        name: 'NotFound',
        $metadata: {
          httpStatusCode: 404,
        },
      }));

    await expect(service.deleteObject('docs/report.txt')).resolves.toBeUndefined();
    await expect(service.deleteObject('docs/report.txt')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
  });

  it('pings the configured bucket', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(service.ping()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
  });

  it('creates the configured bucket when it is missing', async () => {
    const { service, send } = createService();
    send
      .mockRejectedValueOnce(new S3ServiceException({
        name: 'NotFound',
        $metadata: {
          httpStatusCode: 404,
        },
      }))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await service.putObject({
      key: 'avatars/user-1.txt',
      body: 'hello storage',
      contentType: 'text/plain',
    });

    expect(send).toHaveBeenNthCalledWith(1, expect.any(HeadBucketCommand));
    expect(send).toHaveBeenNthCalledWith(2, expect.any(CreateBucketCommand));
    expect(send).toHaveBeenNthCalledWith(3, expect.any(HeadBucketCommand));
    expect(send).toHaveBeenNthCalledWith(4, expect.any(PutBucketPolicyCommand));
    expect(send).toHaveBeenNthCalledWith(5, expect.any(PutObjectCommand));
    expect(result.url).toBe('http://127.0.0.1:9000/app-files/avatars/user-1.txt');
  });

  it('reuses the ensured bucket across subsequent operations', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: Readable.from([Buffer.from('hello')]),
      });

    await service.putObject({
      key: 'avatars/user-1.txt',
      body: 'hello storage',
      contentType: 'text/plain',
    });
    await service.getObject('avatars/user-1.txt');

    expect(send).toHaveBeenNthCalledWith(1, expect.any(HeadBucketCommand));
    expect(send).toHaveBeenNthCalledWith(2, expect.any(PutBucketPolicyCommand));
    expect(send).toHaveBeenNthCalledWith(3, expect.any(PutObjectCommand));
    expect(send).toHaveBeenNthCalledWith(4, expect.any(GetObjectCommand));
  });

  it('sets the public-read bucket policy when a public base url is configured', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await service.ping();

    expect(send).toHaveBeenNthCalledWith(1, expect.any(HeadBucketCommand));
    expect(send).toHaveBeenNthCalledWith(2, expect.any(PutBucketPolicyCommand));
  });

  it('rejects invalid keys', async () => {
    const { service } = createService();

    await expect(
      service.putObject({
        key: '../secrets.txt',
        body: 'nope',
      })
    ).rejects.toThrow('invalid path segment');

    expect(() => service.getPublicUrl('/absolute.txt')).toThrow(
      'Storage key must be relative.'
    );
  });
});
