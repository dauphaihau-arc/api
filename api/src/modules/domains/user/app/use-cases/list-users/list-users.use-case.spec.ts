import { buildPaginationMeta } from '~/common/application/pagination';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { UserRepository } from '../../ports/user.repository';
import {
  DEFAULT_USER_LIST_SORT,
  type ListUsersQuery,
  type UserSummary,
} from '../../user.types';
import { ListUsersUseCase } from './list-users.use-case';

describe('ListUsersUseCase', () => {
  const users: UserSummary[] = [
    {
      id: 'user-1',
      version: 1,
      email: 'member@example.com',
      displayName: 'Member User',
      status: UserStatus.ACTIVE,
    },
  ];

  const query: ListUsersQuery = {
    page: 2,
    limit: 10,
    sort: DEFAULT_USER_LIST_SORT,
  };

  function buildDeps() {
    const userRepository: jest.Mocked<UserRepository> = {
      findAll: jest.fn().mockResolvedValue({
        items: users,
        total: 25,
      }),
      findById: jest.fn(),
    };

    return {
      userRepository,
    };
  }

  it('returns paginated users with pagination metadata', async () => {
    const { userRepository } = buildDeps();
    const useCase = new ListUsersUseCase(userRepository);

    const result = await useCase.execute(query);

    expect(userRepository.findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual({
      items: users,
      meta: buildPaginationMeta(query.page, query.limit, 25),
    });
  });
});
