import { RedisRateLimitStorage } from './redis-rate-limit.storage';

describe('RedisRateLimitStorage', () => {
  it('maps redis script output to throttler storage values', async () => {
    const evalMock = jest.fn().mockResolvedValue([3, 4_250, 1, 9_500]);
    const storage = new RedisRateLimitStorage({
      eval: evalMock,
      isOpen: true,
      quit: jest.fn(),
    });

    await expect(
      storage.increment('request-key', 60_000, 20, 60_000, 'default')
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 5,
      isBlocked: true,
      timeToBlockExpire: 10,
    });

    expect(evalMock).toHaveBeenCalledWith(expect.any(String), {
      keys: [
        'rate-limit:default:request-key:hits',
        'rate-limit:default:request-key:blocked',
      ],
      arguments: [
        expect.any(String),
        '60000',
        '20',
        '60000',
        expect.any(String),
      ],
    });
  });
});
