import type { ConfigService } from '@nestjs/config';
import { parseDurationToSeconds } from '../libs/duration';

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshSecret: string;
  jwtRefreshTtlSeconds: number;
  bcryptSaltRounds: number;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export function buildAuthConfig(
  configService: Pick<ConfigService, 'get'>
): AuthConfig {
  return {
    jwtAccessSecret: configService.get<string>(
      'JWT_ACCESS_SECRET',
      'change-me-access-secret'
    ),
    jwtAccessTtlSeconds: parseDurationToSeconds(
      configService.get<string>('JWT_ACCESS_TTL', '15m'),
      15 * 60
    ),
    jwtRefreshSecret: configService.get<string>(
      'JWT_REFRESH_SECRET',
      'change-me-refresh-secret'
    ),
    jwtRefreshTtlSeconds: parseDurationToSeconds(
      configService.get<string>('JWT_REFRESH_TTL', '7d'),
      7 * 24 * 60 * 60
    ),
    bcryptSaltRounds: Number(
      configService.get<string>('BCRYPT_SALT_ROUNDS', '12')
    ),
  };
}
