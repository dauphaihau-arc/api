import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ENCRYPTION_CONFIG,
  type EncryptionConfig,
} from '~/platform/config/encryption.config';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PAYLOAD_VERSION = 'v1';

@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;

  constructor(
    @Inject(ENCRYPTION_CONFIG) encryptionConfig: EncryptionConfig,
  ) {
    this.key = resolveEncryptionKey(encryptionConfig.fieldEncryptionKey);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      PAYLOAD_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] =
      payload.split(':');
    if (
      version !== PAYLOAD_VERSION
      || !encodedIv
      || !encodedTag
      || encodedCiphertext === undefined
      || extra.length > 0
    ) {
      throw new Error('Invalid field encryption payload');
    }

    const iv = Buffer.from(encodedIv, 'base64');
    const tag = Buffer.from(encodedTag, 'base64');
    const ciphertext = Buffer.from(encodedCiphertext, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
      throw new Error('Invalid field encryption payload');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}

function resolveEncryptionKey(value: string | undefined): Buffer {
  if (!value) {
    throw new Error('FIELD_ENCRYPTION_KEY is required');
  }

  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error('FIELD_ENCRYPTION_KEY must encode exactly 32 bytes');
  }

  return key;
}
