import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator';
import {
  USER_LIST_DEFAULT_LIMIT,
  USER_LIST_DEFAULT_PAGE,
  USER_LIST_MAX_LIMIT
} from '../../../app/user.types';

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = USER_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(USER_LIST_MAX_LIMIT)
  limit: number = USER_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  sort?: string;
}
