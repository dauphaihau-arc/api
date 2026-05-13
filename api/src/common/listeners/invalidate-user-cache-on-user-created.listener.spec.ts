import type { Cache } from 'cache-manager';
import { buildUserByIdCacheKey } from '../../modules/domains/user/app/user-cache.keys';
import { UserCreatedEvent } from '../events/user-created.event';
import { InvalidateUserCacheOnUserCreatedListener } from './invalidate-user-cache-on-user-created.listener';

describe('InvalidateUserCacheOnUserCreatedListener', () => {
  it('clears the created user cache entry', async () => {
    const cacheManager: Pick<jest.Mocked<Cache>, 'del'> = {
      del: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new InvalidateUserCacheOnUserCreatedListener(
      cacheManager as unknown as Cache
    );

    await listener.handle(
      new UserCreatedEvent('user-1', 'member@example.com', 'Member User')
    );

    expect(cacheManager.del).toHaveBeenCalledTimes(1);
    expect(cacheManager.del).toHaveBeenCalledWith(
      buildUserByIdCacheKey('user-1')
    );
  });
});
