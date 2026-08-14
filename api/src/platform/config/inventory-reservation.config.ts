import type { ConfigService } from '@nestjs/config';

export type InventoryReservationDriver = 'local' | 'remote';

export interface InventoryReservationConfig {
  driver: InventoryReservationDriver;
  serviceBaseUrl: string;
}

export const INVENTORY_RESERVATION_CONFIG = Symbol('INVENTORY_RESERVATION_CONFIG');

export function buildInventoryReservationConfig(
  configService: Pick<ConfigService, 'get'>,
): InventoryReservationConfig {
  return {
    driver: parseInventoryReservationDriver(
      configService.get<string>('INVENTORY_RESERVATION_DRIVER'),
    ),
    serviceBaseUrl: normalizeServiceBaseUrl(
      configService.get<string>('INVENTORY_SERVICE_BASE_URL'),
    ),
  };
}

function parseInventoryReservationDriver(
  value: string | undefined,
): InventoryReservationDriver {
  return value === 'remote' ? 'remote' : 'local';
}

function normalizeServiceBaseUrl(value: string | undefined): string {
  return (value?.trim() || 'http://127.0.0.1:8080').replace(/\/+$/, '');
}
