import { buildGuestOrderTrackingUrl } from './guest-order-tracking-url.builder';

describe('buildGuestOrderTrackingUrl', () => {
  it('builds a token-based tracking url', () => {
    const result = buildGuestOrderTrackingUrl(
      { appBaseUrl: 'http://localhost:4000' },
      'signed-tracking-token',
    );

    expect(result).toBe('http://localhost:4000/guest-orders?token=signed-tracking-token');
  });

  it('returns undefined when no app base url is configured', () => {
    expect(buildGuestOrderTrackingUrl({}, 'signed-tracking-token')).toBeUndefined();
  });
});
