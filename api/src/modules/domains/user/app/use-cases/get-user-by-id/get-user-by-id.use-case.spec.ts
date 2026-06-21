import type { Cache } from 'cache-manager';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { UserRepository } from '../../ports/user.repository';
import type { UserSummary } from '../../user.types';
import { buildUserByIdCacheKey } from '../../user-cache.keys';
import { GetUserByIdUseCase } from './get-user-by-id.use-case';

describe('GetUserByIdUseCase', () => {
  const user: UserSummary = {
    id: 'user-1',
    version: 1,
    email: 'member@example.com',
    displayName: 'Member User',
    status: UserStatus.ACTIVE,
  };
  function buildDeps() {
    const userRepository: jest.Mocked<UserRepository> = {
      findAll: jest.fn().mockResolvedValue({
        items: [user],
        total: 1,
      }),
      findById: jest.fn().mockResolvedValue(user),
    };
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    return {
      userRepository,
      cacheManager,
    };
  }

  it('returns a cached user when present', async () => {
    const { userRepository, cacheManager } = buildDeps();
    cacheManager.get.mockResolvedValue(user);
    const useCase = new GetUserByIdUseCase(
      userRepository,
      cacheManager as unknown as Cache,
    );

    const result = await useCase.execute(user.id);

    expect(cacheManager.get).toHaveBeenCalledWith(buildUserByIdCacheKey(user.id));
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(cacheManager.set).not.toHaveBeenCalled();
    expect(result).toEqual(user);
  });

  it('loads and caches a found user when the cache is empty', async () => {
    const { userRepository, cacheManager } = buildDeps();
    const useCase = new GetUserByIdUseCase(
      userRepository,
      cacheManager as unknown as Cache,
    );

    const result = await useCase.execute(user.id);

    expect(userRepository.findById).toHaveBeenCalledWith(user.id);
    expect(cacheManager.set).toHaveBeenCalledWith(
      buildUserByIdCacheKey(user.id),
      user,
    );
    expect(result).toEqual(user);
  });

  it('does not cache misses', async () => {
    const { userRepository, cacheManager } = buildDeps();
    userRepository.findById.mockResolvedValue(null);
    const useCase = new GetUserByIdUseCase(
      userRepository,
      cacheManager as unknown as Cache,
    );

    const result = await useCase.execute('missing-user');

    expect(cacheManager.set).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
