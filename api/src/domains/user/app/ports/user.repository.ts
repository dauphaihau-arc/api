import type {
  ListUsersQuery,
  ListUsersRepositoryResult,
  UserSummary,
} from '../user.types';

export abstract class UserRepository {
  abstract findAll(query: ListUsersQuery): Promise<ListUsersRepositoryResult>;
  abstract findById(id: string): Promise<UserSummary | null>;
}
