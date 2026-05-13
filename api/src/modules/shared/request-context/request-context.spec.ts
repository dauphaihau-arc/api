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

        return undefined;
      },
    });

    expect(requestContext).toEqual({
      requestId: 'req-123',
      ipAddress: '203.0.113.10',
      userAgent: 'jest-agent',
    });
  });

  it('normalizes empty values to undefined', () => {
    const requestContext = extractRequestContext({
      ip: '   ',
      headers: {
        'x-request-id': '',
        'user-agent': '   ',
      },
    });

    expect(requestContext).toEqual({
      requestId: undefined,
      ipAddress: undefined,
      userAgent: undefined,
    });
  });
});
