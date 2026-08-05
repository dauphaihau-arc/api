import { Expose, Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ListShopOrdersQueryDto } from './list-shop-orders.query.dto';

export enum ShopOrderExportDateRange {
  TODAY = 'today',
  CURRENT_MONTH = 'current_month',
  LAST_7_DAYS = 'last_7_days',
  LAST_4_WEEKS = 'last_4_weeks',
  LAST_MONTH = 'last_month',
  ALL = 'all',
  CUSTOM = 'custom',
}

export enum ShopOrderExportColumnPreset {
  DEFAULT = 'default',
  CUSTOM = 'custom',
}

export class ExportShopOrdersQueryDto extends ListShopOrdersQueryDto {
  @IsOptional()
  @Expose({ name: 'date_range' })
  @Transform(({ value, obj: source }) => value ?? source.date_range)
  @IsEnum(ShopOrderExportDateRange)
  dateRange?: ShopOrderExportDateRange;

  @IsOptional()
  @IsString()
  @Matches(/^UTC$|^[A-Za-z_]+\/[A-Za-z_/-]+$/)
  timezone: string = 'UTC';

  @IsOptional()
  @Expose({ name: 'column_preset' })
  @Transform(({ value, obj: source }) => value ?? source.column_preset)
  @IsEnum(ShopOrderExportColumnPreset)
  columnPreset: ShopOrderExportColumnPreset = ShopOrderExportColumnPreset.DEFAULT;

  @IsOptional()
  @Transform(({ value, obj: source }) => toOptionalStringArray(value ?? source.columns))
  @IsArray()
  @IsString({ each: true })
  columns?: string[];
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawValues = Array.isArray(value) ? value : [value];

  const normalized = rawValues
    .flatMap((entry) => String(entry).split(','))
    .map(entry => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}
