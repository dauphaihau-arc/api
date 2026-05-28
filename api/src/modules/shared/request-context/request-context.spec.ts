import { extractRequestContext } from './request-context.bootstrap';

describe('extractRequestContext', () => {
  it('extracts request id, ip address, and user agent from a request-like object', () => {
    const requestContext = extractRequestContext({
      ip: '203.0.113.10',
      get: (name: string) => {
        if (name === 'x-request-id') {
          return 'req-123';
        }

        if (name === 'user-agent') {
          return 'jest-agent';
        }

        if (name === 'x-market-code') {
          return 'VN';
        }

        if (name === 'x-currency') {
          return 'VND';
        }

        if (name === 'x-locale') {
          return 'vi-VN';
        }

        if (name === 'x-channel') {
          return 'WEB';
        }

        return undefined;
      },
    });

    expect(requestContext).toEqual({
      requestId: 'req-123',
      ipAddress: '203.0.113.10',
      userAgent: 'jest-agent',
      marketCode: 'VN',
      currency: 'VND',
      locale: 'vi-VN',
      channel: 'WEB',
    });
  });

  it('normalizes empty values to undefined', () => {
    const requestContext = extractRequestContext({
      ip: '   ',
      headers: {
        'x-request-id': '',
        'user-agent': '   ',
        'x-market-code': '',
        'x-currency': '   ',
        'x-locale': '',
        'x-channel': ' ',
      },
    });

    expect(requestContext).toEqual({
      requestId: undefined,
      ipAddress: undefined,
      userAgent: undefined,
      marketCode: undefined,
      currency: undefined,
      locale: undefined,
      channel: undefined,
    });
  });

  it('falls back to x-market when x-market-code is absent', () => {
    const requestContext = extractRequestContext({
      headers: {
        'x-market': 'US',
      },
    });

    expect(requestContext.marketCode).toBe('US');
  });
});
