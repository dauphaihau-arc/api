import { FieldEncryptionService } from './field-encryption.service';

describe('FieldEncryptionService', () => {
  function createService(fieldEncryptionKey?: string): FieldEncryptionService {
    return new FieldEncryptionService({ fieldEncryptionKey });
  }

  it('round-trips a string', () => {
    const service = createService(Buffer.alloc(32, 7).toString('base64'));
    const ciphertext = service.encrypt('seller-reference-1234');

    expect(service.decrypt(ciphertext)).toBe('seller-reference-1234');
  });

  it('uses a different ciphertext for the same plaintext each time', () => {
    const service = createService(Buffer.alloc(32, 7).toString('base64'));

    expect(service.encrypt('seller-reference-1234')).not.toBe(
      service.encrypt('seller-reference-1234'),
    );
  });

  it('throws when the payload has been tampered with', () => {
    const service = createService(Buffer.alloc(32, 7).toString('base64'));
    const payload = service.encrypt('seller-reference-1234');
    const [, iv, tag, ciphertext] = payload.split(':');
    const altered = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;

    expect(() => service.decrypt(`v1:${iv}:${tag}:${altered}`)).toThrow();
  });

  it('throws when the key is missing', () => {
    expect(() => createService(undefined)).toThrow(/FIELD_ENCRYPTION_KEY is required/);
  });

  it('throws when the key does not encode 32 bytes', () => {
    expect(() => createService(Buffer.alloc(31).toString('base64'))).toThrow(
      /FIELD_ENCRYPTION_KEY must encode exactly 32 bytes/,
    );
  });
});
