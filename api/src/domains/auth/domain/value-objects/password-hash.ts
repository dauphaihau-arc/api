import {
  PasswordHashRequiredError,
  UnsupportedPasswordHashFormatError,
} from '../errors/auth-domain.error';

export class PasswordHash {
  private constructor(private readonly value: string) {}

  static fromPersisted(raw: string): PasswordHash {
    if (!raw) {
      throw new PasswordHashRequiredError();
    }

    if (!raw.startsWith('$2')) {
      throw new UnsupportedPasswordHashFormatError();
    }

    return new PasswordHash(raw);
  }

  toString(): string {
    return this.value;
  }
}
