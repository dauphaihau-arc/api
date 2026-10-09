import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { PaginatedResult } from '~/platform/application/pagination';
import type { UserSummary } from '../../../app/user.types';

export class UserResponseDto {
  @ApiProperty({ description: 'Internal user id.' })
  id!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false })
  display_name?: string;

  @ApiProperty({ required: false })
  avatar?: string;

  @ApiProperty()
  status!: string;
}

export class UserListMetaResponseDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  has_next_page!: boolean;

  @ApiProperty()
  has_previous_page!: boolean;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  @Type(() => UserResponseDto)
  items!: UserResponseDto[];

  @ApiProperty({ type: UserListMetaResponseDto })
  @Type(() => UserListMetaResponseDto)
  meta!: UserListMetaResponseDto;
}

export type UserResponse = {
  id: string;
  version: number;
  email: string;
  display_name?: string;
  avatar?: string;
  status: string;
};

export type UserListResponse = {
  items: UserResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
};

export function toUserResponse(user: UserSummary): UserResponse {
  return {
    id: user.id,
    version: user.version,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatar,
    status: user.status,
  };
}

export function toUserListResponse(result: PaginatedResult<UserSummary>): UserListResponse {
  return {
    items: result.items.map(toUserResponse),
    meta: {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
      total_pages: result.meta.totalPages,
      has_next_page: result.meta.hasNextPage,
      has_previous_page: result.meta.hasPreviousPage,
    },
  };
}
