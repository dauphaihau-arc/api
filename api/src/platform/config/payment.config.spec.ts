import ms from 'ms';
import { buildPaymentConfig } from './payment.config';

function buildConfig(values: Record<string, string | undefined>) {
  return buildPaymentConfig({
    get: jest.fn((key: string) => values[key]),
  });
}

describe('buildPaymentConfig', () => {
  it('defaults the checkout session lifetime to one hour', () => {
    expect(buildConfig({}).checkoutSessionTtlMs).toBe(ms('60m'));
  });

  it('parses a configured checkout session lifetime', () => {
    expect(
      buildConfig({ CHECKOUT_SESSION_TTL: '45m' }).checkoutSessionTtlMs,
    ).toBe(ms('45m'));
  });

  it('rejects a session lifetime below the Stripe minimum', () => {
    expect(() => buildConfig({ CHECKOUT_SESSION_TTL: '10m' })).toThrow(
      /CHECKOUT_SESSION_TTL must be between 30m and 24h/,
    );
  });

  it('rejects a session lifetime above the Stripe maximum', () => {
    expect(() => buildConfig({ CHECKOUT_SESSION_TTL: '25h' })).toThrow(
      /CHECKOUT_SESSION_TTL must be between 30m and 24h/,
    );
  });
});
