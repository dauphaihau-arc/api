import {
  EmailRequiredError,
  InvalidEmailError
} from '../errors/auth-domain.error';

export class Email {
  private constructor(private readonly value: string) {}

  static create(raw: string): Email {
    const normalized = raw.trim().toLowerCase();

    if (!normalized) {
      throw new EmailRequiredError();
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new InvalidEmailError();
    }

    return new Email(normalized);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
