import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const AUDIT_LOG_LIST_DEFAULT_PAGE = 1;
const AUDIT_LOG_LIST_DEFAULT_LIMIT = 20;
const AUDIT_LOG_LIST_MAX_LIMIT = 100;

export class ListAuditLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = AUDIT_LOG_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(AUDIT_LOG_LIST_MAX_LIMIT)
  limit: number = AUDIT_LOG_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  action?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  actor_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  entity_id?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  entity_type?: string[];
}

export class ExportAuditLogsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  action?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  actor_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  entity_id?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  entity_type?: string[];
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawValues = Array.isArray(value) ? value : [value];
  const normalized = rawValues
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}
