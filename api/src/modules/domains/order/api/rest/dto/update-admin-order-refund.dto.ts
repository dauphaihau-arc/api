import { Expose, Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export enum AdminOrderRefundAction {
  RETRY = 'retry',
  MARK_SUCCEEDED = 'mark_succeeded',
  MARK_FAILED = 'mark_failed',
  MARK_NOT_REQUIRED = 'mark_not_required'
}

export class UpdateAdminOrderRefundDto {
  @IsEnum(AdminOrderRefundAction)
  action!: AdminOrderRefundAction;

  @IsOptional()
  @Expose({ name: 'reason' })
  @Transform(({ value, obj: source }) => value ?? source.reason)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
