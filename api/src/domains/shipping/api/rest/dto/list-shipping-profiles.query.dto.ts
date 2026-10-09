import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import {
  SHIPPING_PROFILE_LIST_DEFAULT_LIMIT,
  SHIPPING_PROFILE_LIST_DEFAULT_PAGE,
  SHIPPING_PROFILE_LIST_MAX_LIMIT,
} from '../../../app/shipping.constants';

export class ListShippingProfilesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = SHIPPING_PROFILE_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SHIPPING_PROFILE_LIST_MAX_LIMIT)
  limit = SHIPPING_PROFILE_LIST_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    name: 'status',
    enum: ShippingProfileStatus,
    isArray: true,
    description: 'Lifecycle states to list, repeatable or comma-separated. ' +
      'Defaults to active and draft; archived profiles are only listed when requested.',
  })
  @IsOptional()
  // Accepts both `?status=active&status=draft` and `?status=active,draft`.
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const statuses = (Array.isArray(value) ? value : [value])
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    return statuses.length > 0 ? statuses as ShippingProfileStatus[] : undefined;
  })
  @IsArray()
  @IsEnum(ShippingProfileStatus, { each: true })
  status?: ShippingProfileStatus[];
}
