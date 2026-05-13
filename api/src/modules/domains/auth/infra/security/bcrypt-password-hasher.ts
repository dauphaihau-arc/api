import { Inject, Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AUTH_CONFIG } from '../../../../../config/auth.config';
import type { AuthConfig } from '../../../../../config/auth.config';
import { PasswordHasher } from '../../app/ports/password-hasher';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  private readonly saltRounds: number;

  constructor(@Inject(AUTH_CONFIG) authConfig: AuthConfig) {
    this.saltRounds = authConfig.bcryptSaltRounds;
  }

  async hash(value: string): Promise<string> {
    return hash(value, this.saltRounds);
  }

  async matches(rawValue: string, hashedValue: string): Promise<boolean> {
    return compare(rawValue, hashedValue);
  }
}
