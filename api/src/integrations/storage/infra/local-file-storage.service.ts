import {
  access, mkdir, readFile, rm, stat, writeFile, 
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { LocalStorageConfig } from '~/platform/config/storage.config';
import type { StorageService } from '../app/ports/storage.service';
import type { PutStorageObjectInput, StoredObject } from '../app/storage.types';
import { normalizeStorageKey } from './storage-key.util';

export class LocalFileStorageService implements StorageService {
  private readonly rootPath: string;

  constructor(private readonly storageConfig: LocalStorageConfig) {
    this.rootPath = path.resolve(this.storageConfig.localRoot);
  }

  async putObject(input: PutStorageObjectInput): Promise<StoredObject> {
    const normalizedKey = this.normalizeKey(input.key);
    const filePath = this.resolveFilePath(normalizedKey);

    await mkdir(path.dirname(filePath), {
      recursive: true,
    });

    const size = await this.writeBody(filePath, input.body);

    return {
      key: normalizedKey,
      size,
      contentType: input.contentType,
      url: this.getPublicUrl(normalizedKey),
    };
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolveFilePath(key));
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveFilePath(key), {
      force: true,
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fileStat = await stat(this.resolveFilePath(key));
      return fileStat.isFile();
    }
    catch {
      return false;
    }
  }

  getPublicUrl(key: string): string | undefined {
    const normalizedKey = this.normalizeKey(key);

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
    await mkdir(this.rootPath, {
      recursive: true,
    });
    await access(this.rootPath);
  }

  private resolveFilePath(key: string): string {
    const normalizedKey = normalizeStorageKey(key);
    return path.join(this.rootPath, ...normalizedKey.split('/'));
  }

  private normalizeKey(key: string): string {
    return normalizeStorageKey(key);
  }

  private async writeBody(
    filePath: string,
    body: PutStorageObjectInput['body'],
  ): Promise<number> {
    if (body instanceof Readable) {
      await pipeline(body, createWriteStream(filePath));
      return (await stat(filePath)).size;
    }

    const buffer = this.toBuffer(body);
    await writeFile(filePath, buffer);
    return buffer.byteLength;
  }

  private toBuffer(body: Buffer | Uint8Array | string): Buffer {
    if (typeof body === 'string') {
      return Buffer.from(body);
    }

    return Buffer.from(body);
  }
}
