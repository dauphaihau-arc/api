import { ArgsType, Field, Int } from '@nestjs/graphql';
import {
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  USER_LIST_DEFAULT_LIMIT,
  USER_LIST_DEFAULT_PAGE,
  USER_LIST_MAX_LIMIT,
} from '../../../app/user.types';

@ArgsType()
export class ListUsersArgs {
  @Field(() => Int, { defaultValue: USER_LIST_DEFAULT_PAGE })
  @IsOptional()
  @Min(1)
  page: number = USER_LIST_DEFAULT_PAGE;

  @Field(() => Int, { defaultValue: USER_LIST_DEFAULT_LIMIT })
  @IsOptional()
  @Min(1)
  @Max(USER_LIST_MAX_LIMIT)
  limit: number = USER_LIST_DEFAULT_LIMIT;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  sort?: string;
}
