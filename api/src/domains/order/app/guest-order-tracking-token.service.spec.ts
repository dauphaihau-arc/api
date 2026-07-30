import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GuestOrderTrackingTokenService } from './guest-order-tracking-token.service';

describe('GuestOrderTrackingTokenService', () => {
  function buildService(overrides?: Record<string, string | undefined>) {
    const values = {
      JWT_ACCESS_SECRET: 'jwt-access-secret',
      GUEST_ORDER_TRACKING_TTL: '30d',
      ...overrides,
    };

    const configService = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = values[key];

        if (!value) {
          throw new Error(`Missing config value: ${key}`);
        }

        return value;
      }),
    } as unknown as ConfigService;

    return new GuestOrderTrackingTokenService(configService);
  }

  it('issues and resolves a session-based token', () => {
    const service = buildService();
    const token = service.issue({ sessionId: 'cs_test_123' });

    expect(service.resolve(token)).toEqual({ sessionId: 'cs_test_123' });
  });

  it('issues and resolves an email plus order ids token', () => {
    const service = buildService();
    const token = service.issue({
      email: 'Guest@Example.com',
      orderIds: ['order-1', 'order-2'],
    });

    expect(service.resolve(token)).toEqual({
      email: 'guest@example.com',
      orderIds: ['order-1', 'order-2'],
    });
  });

  it('rejects a tampered token', () => {
    const service = buildService();
    const token = service.issue({ sessionId: 'cs_test_123' });
    const [payload] = token.split('.');

    expect(() => service.resolve(`${payload}.tampered`)).toThrow(BadRequestException);
  });

  it('rejects an expired token', () => {
    const service = buildService({ GUEST_ORDER_TRACKING_TTL: '1ms' });
    const issuedAt = 1_717_000_000_000;
    const issueNowSpy = jest.spyOn(Date, 'now').mockReturnValue(issuedAt);
    const token = service.issue({ sessionId: 'cs_test_123' });
    issueNowSpy.mockRestore();

    const resolveNowSpy = jest.spyOn(Date, 'now').mockReturnValue(issuedAt + 5);

    expect(() => service.resolve(token)).toThrow(BadRequestException);

    resolveNowSpy.mockRestore();
  });
});
