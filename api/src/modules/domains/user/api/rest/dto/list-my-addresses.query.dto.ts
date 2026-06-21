import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  USER_ADDRESS_LIST_DEFAULT_LIMIT,
  USER_ADDRESS_LIST_DEFAULT_PAGE,
  USER_ADDRESS_LIST_MAX_LIMIT,
} from '../../../app/user-address.types';

export class ListMyAddressesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = USER_ADDRESS_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USER_ADDRESS_LIST_MAX_LIMIT)
  limit = USER_ADDRESS_LIST_DEFAULT_LIMIT;
}
