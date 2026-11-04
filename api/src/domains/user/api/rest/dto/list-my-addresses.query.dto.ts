import { ApiPropertyOptional } from '@nestjs/swagger';
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
} from '../queries/user-address.constants';

export class ListMyAddressesQueryDto {
  @ApiPropertyOptional({
    description: 'One-based page number.',
    type: Number,
    minimum: 1,
    default: USER_ADDRESS_LIST_DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = USER_ADDRESS_LIST_DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Maximum number of addresses to return.',
    type: Number,
    minimum: 1,
    maximum: USER_ADDRESS_LIST_MAX_LIMIT,
    default: USER_ADDRESS_LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USER_ADDRESS_LIST_MAX_LIMIT)
  limit = USER_ADDRESS_LIST_DEFAULT_LIMIT;
}
