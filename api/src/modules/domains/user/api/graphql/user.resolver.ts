import { UseGuards } from '@nestjs/common';
import {
  Args,
  ID,
  Mutation,
  Query,
  Resolver
} from '@nestjs/graphql';
import { resolveOrThrow } from '../../../../../common/application/result';
import { parseSortValue } from '../../../../../common/application/sort';
import { CurrentUser } from '../../../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../../auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '../../../auth/app/auth.types';
import { JwtAuthGuard } from '../../../auth/api/guard/jwt-auth.guard';
import { CreateUserUseCase } from '../../app/use-cases/create-user/create-user.use-case';
import { GetUserByIdUseCase } from '../../app/use-cases/get-user-by-id/get-user-by-id.use-case';
import { ListUsersUseCase } from '../../app/use-cases/list-users/list-users.use-case';
import {
  buildListUsersQuery,
  DEFAULT_USER_LIST_SORT,
  USER_LIST_SORT_FIELDS
} from '../../app/user.types';
import { CreateUserInput } from './dto/create-user.input';
import { ListUsersArgs } from './dto/list-users.args';
import { UserPageType } from './dto/user-page.type';
import { UserType } from './dto/user.type';
import { mapUserAppErrorToGraphQLError } from './user-graphql-error-mapper';

@Resolver(() => UserType)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserResolver {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly getUserByIdUseCase: GetUserByIdUseCase
  ) {}

  @Query(() => UserPageType, { name: 'users' })
  @RequirePermissions('users.read')
  users(@Args() query: ListUsersArgs) {
    const sort = parseSortValue(
      query.sort,
      USER_LIST_SORT_FIELDS,
      DEFAULT_USER_LIST_SORT
    );

    return this.listUsersUseCase.execute(buildListUsersQuery({
      page: query.page,
      limit: query.limit,
      sort,
    }));
  }

  @Query(() => UserType, { name: 'user', nullable: true })
  @RequirePermissions('users.read')
  user(@Args('id', { type: () => ID }) id: string) {
    return this.getUserByIdUseCase.execute(id);
  }

  @Mutation(() => UserType, { name: 'createUser' })
  @RequirePermissions('users.manage')
  createUser(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Args('input') input: CreateUserInput
  ) {
    return this.createUserUseCase
      .execute(currentUser, input)
      .then((result) => resolveOrThrow(result, mapUserAppErrorToGraphQLError));
  }
}
