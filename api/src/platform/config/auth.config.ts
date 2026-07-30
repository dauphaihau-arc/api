import type { ConfigService } from '@nestjs/config';
import { parseDurationToSeconds } from '~/shared/libs/duration';

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshSecret: string;
  jwtRefreshTtlSeconds: number;
  accessCookieName: string;
  refreshCookieName: string;
  cookieDomain?: string;
  cookiePath: string;
  cookieSameSite: 'strict' | 'lax' | 'none';
  cookieSecure: boolean;
  bcryptSaltRounds: number;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export function buildAuthConfig(
  configService: Pick<ConfigService, 'get'>,
): AuthConfig {
  return {
    jwtAccessSecret: configService.get<string>(
      'JWT_ACCESS_SECRET',
      'change-me-access-secret',
    ),
    jwtAccessTtlSeconds: parseDurationToSeconds(
      configService.get<string>('JWT_ACCESS_TTL', '15m'),
      15 * 60,
    ),
    jwtRefreshSecret: configService.get<string>(
      'JWT_REFRESH_SECRET',
      'change-me-refresh-secret',
    ),
    jwtRefreshTtlSeconds: parseDurationToSeconds(
      configService.get<string>('JWT_REFRESH_TTL', '7d'),
      7 * 24 * 60 * 60,
    ),
    accessCookieName: configService.get<string>(
      'AUTH_COOKIE_ACCESS_NAME',
      'accessToken',
    ),
    refreshCookieName: configService.get<string>(
      'AUTH_COOKIE_REFRESH_NAME',
      'refreshToken',
    ),
    cookieDomain: configService.get<string>('AUTH_COOKIE_DOMAIN')?.trim() || undefined,
    cookiePath: configService.get<string>('AUTH_COOKIE_PATH', '/'),
    cookieSameSite: configService.get<'strict' | 'lax' | 'none'>(
      'AUTH_COOKIE_SAME_SITE',
      'lax',
    ),
    cookieSecure: configService.get<string>('AUTH_COOKIE_SECURE', 'false') === 'true',
    bcryptSaltRounds: Number(
      configService.get<string>('BCRYPT_SALT_ROUNDS', '12'),
    ),
  };
}
