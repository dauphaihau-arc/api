import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalFileStorageService } from './local-file-storage.service';

describe('LocalFileStorageService', () => {
  async function createService() {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'storage-spec-'));

    return {
      tempRoot,
      service: new LocalFileStorageService({
        driver: 'local',
        localRoot: tempRoot,
        publicBaseUrl: 'https://cdn.example.com/files/',
      }),
    };
  }

  it('writes and reads objects', async () => {
    const { service, tempRoot } = await createService();

    const result = await service.putObject({
      key: 'avatars/user-1.txt',
      body: 'hello storage',
      contentType: 'text/plain',
    });

    expect(result).toEqual({
      key: 'avatars/user-1.txt',
      size: 13,
      contentType: 'text/plain',
      url: 'https://cdn.example.com/files/avatars/user-1.txt',
    });

    await expect(service.exists('avatars/user-1.txt')).resolves.toBe(true);
    await expect(service.getObject('avatars/user-1.txt')).resolves.toEqual(
      Buffer.from('hello storage')
    );
    await expect(
      readFile(path.join(tempRoot, 'avatars', 'user-1.txt'), 'utf8')
    ).resolves.toBe('hello storage');
  });

  it('deletes objects idempotently', async () => {
    const { service } = await createService();

    await service.putObject({
      key: 'docs/report.txt',
      body: 'draft',
    });

    await expect(service.deleteObject('docs/report.txt')).resolves.toBeUndefined();
    await expect(service.deleteObject('docs/report.txt')).resolves.toBeUndefined();
    await expect(service.exists('docs/report.txt')).resolves.toBe(false);
  });

  it('rejects directory traversal keys', async () => {
    const { service } = await createService();

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
