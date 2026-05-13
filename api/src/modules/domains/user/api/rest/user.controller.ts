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
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import type { PaginatedResult } from '~/common/application/pagination';
import { resolveOrThrow } from '~/common/application/result';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { ParseSortPipe } from '~/common/pipes/parse-sort.pipe';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CreateUserUseCase } from '~/modules/domains/user/app/use-cases/create-user.use-case';
import { GetUserByIdUseCase } from '~/modules/domains/user/app/use-cases/get-user-by-id.use-case';
import { ListUsersUseCase } from '~/modules/domains/user/app/use-cases/list-users.use-case';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import {
  type UploadedAvatarFile,
  UpdateUserUseCase
} from '~/modules/domains/user/app/use-cases/update-user.use-case';
import {
  buildListUsersQuery,
  DEFAULT_USER_LIST_SORT,
  USER_LIST_SORT_FIELDS,
  type UserSummary
} from '../../app/user.types';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { mapUserAppErrorToHttpException } from './user-http-error-mapper';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
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
  users(
    @Query() query: ListUsersQueryDto,
    @Query(
      'sort',
      new ParseSortPipe(USER_LIST_SORT_FIELDS, DEFAULT_USER_LIST_SORT)
    )
    sort = DEFAULT_USER_LIST_SORT
  ): Promise<PaginatedResult<UserSummary>> {
    return this.listUsersUseCase.execute(buildListUsersQuery({
      page: query.page,
      limit: query.limit,
      sort,
    }));
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @Header('Cache-Control', 'private, no-cache')
  async user(@Param('id') id: string): Promise<UserSummary> {
    const user = await this.getUserByIdUseCase.execute(id);

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    return user;
  }

  @Post()
  @RequirePermissions('users.manage')
  createUser(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateUserDto
  ): Promise<UserSummary> {
    return this.createUserUseCase
      .execute(currentUser, body)
      .then((result) => resolveOrThrow(result, mapUserAppErrorToHttpException));
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FileInterceptor('avatar'))
  updateUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateUserDto,
    @UploadedFile() avatarFile?: UploadedAvatarFile
  ): Promise<UserSummary> {
    this.validateAvatarFile(avatarFile);

    return this.updateUserUseCase.execute(currentUser, id, {
      version: body.version,
      displayName: body.displayName,
      status: body.status,
      avatarFile,
    }).then((result) => resolveOrThrow(result, mapUserAppErrorToHttpException));
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
