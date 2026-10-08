import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';

const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * The seller-facing Sale form's payload: an ordinary internal name, a positive
 * percentage, an all-or-selected Product Scope, and an explicit schedule
 * authored as local wall-clock times in a chosen IANA timezone.
 *
 * `start_now` starts the Sale immediately; otherwise `start_local` carries the
 * chosen wall clock. The optional offsets let a caller explicitly disambiguate
 * a repeated fall-back local time; a nonexistent spring-forward local time is
 * always rejected.
 */
export class CreateShopSaleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @ApiProperty()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  @ApiProperty({ name: 'percent_off', minimum: 1, maximum: 99 })
  percent_off!: number;

  @IsEnum(PromotionProductScope)
  @ApiProperty({
    name: 'product_scope',
    enum: PromotionProductScope,
    default: PromotionProductScope.ALL,
  })
  product_scope: PromotionProductScope = PromotionProductScope.ALL;

  @ValidateIf((dto: CreateShopSaleDto) =>
    dto.product_scope === PromotionProductScope.SPECIFIC)
  @IsArray()
  @ArrayNotEmpty()
  @Matches(/^prod_[0-9a-f]{12}$/, { each: true })
  @ApiPropertyOptional({ name: 'product_ids', type: [String] })
  product_ids?: string[];

  @IsString()
  @MaxLength(64)
  @ApiProperty({ description: 'IANA timezone the schedule is authored in.' })
  timezone!: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ name: 'start_now', default: false })
  start_now?: boolean;

  @ValidateIf((dto: CreateShopSaleDto) => dto.start_now !== true)
  @IsString()
  @Matches(LOCAL_DATE_TIME_PATTERN, {
    message: 'start_local must be formatted as YYYY-MM-DDTHH:mm',
  })
  @ApiPropertyOptional({ name: 'start_local' })
  start_local?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  @ApiPropertyOptional({ name: 'start_offset_minutes' })
  start_offset_minutes?: number;

  @IsString()
  @Matches(LOCAL_DATE_TIME_PATTERN, {
    message: 'end_local must be formatted as YYYY-MM-DDTHH:mm',
  })
  @ApiProperty({ name: 'end_local' })
  end_local!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  @ApiPropertyOptional({ name: 'end_offset_minutes' })
  end_offset_minutes?: number;
}
