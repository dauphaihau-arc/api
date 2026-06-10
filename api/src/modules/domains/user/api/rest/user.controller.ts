import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiCookieAuth, ApiExcludeController,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import { resolveOrThrow } from '~/common/application/result';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { ParseSortPipe } from '~/common/pipes/parse-sort.pipe';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CreateUserUseCase } from '~/modules/domains/user/app/use-cases/create-user/create-user.use-case';
import { GetUserByIdUseCase } from '~/modules/domains/user/app/use-cases/get-user-by-id/get-user-by-id.use-case';
import { ListUsersUseCase } from '~/modules/domains/user/app/use-cases/list-users/list-users.use-case';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import {
  type UploadedAvatarFile,
  UpdateUserUseCase
} from '~/modules/domains/user/app/use-cases/update-user/update-user.use-case';
import {
  buildListUsersQuery,
  DEFAULT_USER_LIST_SORT,
  USER_LIST_SORT_FIELDS
} from '../../app/user.types';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { mapUserAppErrorToHttpException } from './user-http-error-mapper';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import {
  toUserListResponse,
  toUserResponse,
  type UserListResponse,
  type UserResponse
} from './user.response';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiExcludeController()
@ApiTags('Users')
@ApiCookieAuth('accessCookie')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly getUserByIdUseCase: GetUserByIdUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase
  ) {}

  @Get()
  @RequirePermissions('users.read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({
    description: 'Paginated user list.',
    schema: { type: 'object' },
  })
  users(
    @Query() query: ListUsersQueryDto,
    @Query(
      'sort',
      new ParseSortPipe(USER_LIST_SORT_FIELDS, DEFAULT_USER_LIST_SORT)
    )
    sort = DEFAULT_USER_LIST_SORT
  ): Promise<UserListResponse> {
    return this.listUsersUseCase.execute(buildListUsersQuery({
      page: query.page,
      limit: query.limit,
      sort,
    })).then(toUserListResponse);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'User detail.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'User was not found.' })
  async user(@Param('id') id: string): Promise<UserResponse> {
    const user = await this.getUserByIdUseCase.execute(id);

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    return toUserResponse(user);
  }

  @Post()
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Create a user' })
  @ApiOkResponse({
    description: 'Created user.',
    schema: { type: 'object' },
  })
  createUser(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateUserDto
  ): Promise<UserResponse> {
    return this.createUserUseCase
      .execute(currentUser, body)
      .then((result) => resolveOrThrow(result, mapUserAppErrorToHttpException))
      .then(toUserResponse);
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Updated user.',
    schema: { type: 'object' },
  })
  updateUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateUserDto,
    @UploadedFile() avatarFile?: UploadedAvatarFile
  ): Promise<UserResponse> {
    this.validateAvatarFile(avatarFile);

    return this.updateUserUseCase.execute(currentUser, id, {
      version: body.version,
      displayName: body.displayName,
      status: body.status,
      avatarFile,
    }).then((result) => resolveOrThrow(result, mapUserAppErrorToHttpException))
      .then(toUserResponse);
  }

  private validateAvatarFile(file?: UploadedAvatarFile): void {
    if (!file) {
      return;
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar file must be an image');
    }

    if (!file.buffer?.byteLength) {
      throw new BadRequestException('Avatar file is empty');
    }
  }
}
