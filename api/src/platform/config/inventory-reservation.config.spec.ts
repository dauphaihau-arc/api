import { buildInventoryReservationConfig } from './inventory-reservation.config';

describe('buildInventoryReservationConfig', () => {
  it('defaults to the local driver and local Go service URL', () => {
    const config = buildInventoryReservationConfig({
      get: jest.fn((_, fallback?: unknown) => fallback),
    });

    expect(config).toEqual({
      driver: 'local',
      serviceBaseUrl: 'http://127.0.0.1:8080',
    });
  });

  it('accepts the remote driver and normalizes the service base URL', () => {
    const values: Record<string, string | undefined> = {
      INVENTORY_RESERVATION_DRIVER: 'remote',
      INVENTORY_SERVICE_BASE_URL: 'http://inventory-service:8080/',
    };
    const config = buildInventoryReservationConfig({
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    });

    expect(config).toEqual({
      driver: 'remote',
      serviceBaseUrl: 'http://inventory-service:8080',
    });
  });

  it('falls back to local for unknown drivers', () => {
    const config = buildInventoryReservationConfig({
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'INVENTORY_RESERVATION_DRIVER' ? 'rabbitmq' : fallback),
    });

    expect(config.driver).toBe('local');
  });
});
