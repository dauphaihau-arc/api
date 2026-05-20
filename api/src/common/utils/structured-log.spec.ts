import { buildStructuredLog } from './structured-log';

describe('buildStructuredLog', () => {
  it('removes undefined fields recursively', () => {
    expect(
      buildStructuredLog({
        event: 'http.request.completed',
        requestId: 'req-123',
        actorId: undefined,
        http: {
          method: 'POST',
          statusCode: 201,
          path: '/v1/orders',
          userAgent: undefined,
        },
      })
    ).toBe(
      JSON.stringify({
        event: 'http.request.completed',
        requestId: 'req-123',
        http: {
          method: 'POST',
          statusCode: 201,
          path: '/v1/orders',
        },
      })
    );
  });
});
