import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { OptionalCacheService } from '~/integrations/cache/optional-cache.service';
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
    const optionalCacheService: Pick<jest.Mocked<OptionalCacheService>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    return {
      userRepository,
      optionalCacheService,
    };
  }

  it('returns a cached user when present', async () => {
    const { userRepository, optionalCacheService } = buildDeps();
    optionalCacheService.get.mockResolvedValue(user);
    const useCase = new GetUserByIdUseCase(
      userRepository,
      optionalCacheService as unknown as OptionalCacheService,
    );

    const result = await useCase.execute(user.id);

    expect(optionalCacheService.get).toHaveBeenCalledWith(
      'user.by-id',
      buildUserByIdCacheKey(user.id),
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(optionalCacheService.set).not.toHaveBeenCalled();
    expect(result).toEqual(user);
  });

  it('loads and caches a found user when the cache is empty', async () => {
    const { userRepository, optionalCacheService } = buildDeps();
    const useCase = new GetUserByIdUseCase(
      userRepository,
      optionalCacheService as unknown as OptionalCacheService,
    );

    const result = await useCase.execute(user.id);

    expect(userRepository.findById).toHaveBeenCalledWith(user.id);
    expect(optionalCacheService.set).toHaveBeenCalledWith(
      'user.by-id',
      buildUserByIdCacheKey(user.id),
      user,
    );
    expect(result).toEqual(user);
  });

  it('does not cache misses', async () => {
    const { userRepository, optionalCacheService } = buildDeps();
    userRepository.findById.mockResolvedValue(null);
    const useCase = new GetUserByIdUseCase(
      userRepository,
      optionalCacheService as unknown as OptionalCacheService,
    );

    const result = await useCase.execute('missing-user');

    expect(optionalCacheService.set).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
