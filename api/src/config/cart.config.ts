import type { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { parseDurationToMilliseconds } from '../libs/duration';

export interface CartConfig {
  guestCartSessionTtlMs: number;
}

export const CART_CONFIG = Symbol('CART_CONFIG');

export function buildCartConfig(
  configService: Pick<ConfigService, 'get'>,
): CartConfig {
  return {
    guestCartSessionTtlMs: parseDurationToMilliseconds(
      configService.get<string>('GUEST_CART_SESSION_TTL', '30d'),
      ms('30d'),
    ),
  };
}
