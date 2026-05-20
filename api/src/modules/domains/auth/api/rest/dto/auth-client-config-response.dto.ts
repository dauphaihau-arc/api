import type { AuthConfig } from '~/config/auth.config';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_PATTERN
} from '../validation/password-validation';

export class AuthClientConfigResponseDto {
  version!: string;
  password!: {
    min_length: number;
    max_length: number;
    pattern: string;
    requirements: {
      lowercase: boolean;
      uppercase: boolean;
      number: boolean;
      special_character: boolean;
    };
    message: string;
  };
  session!: {
    access_token_ttl_seconds: number;
    refresh_token_ttl_seconds: number;
  };

  static create(authConfig: AuthConfig): AuthClientConfigResponseDto {
    return {
      version: '2026-05-20',
      password: {
        min_length: AUTH_PASSWORD_MIN_LENGTH,
        max_length: AUTH_PASSWORD_MAX_LENGTH,
        pattern: AUTH_PASSWORD_PATTERN.source,
        requirements: {
          lowercase: true,
          uppercase: true,
          number: true,
          special_character: true
        },
        message:
          'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character'
      },
      session: {
        access_token_ttl_seconds: authConfig.jwtAccessTtlSeconds,
        refresh_token_ttl_seconds: authConfig.jwtRefreshTtlSeconds
      }
    };
  }
}
