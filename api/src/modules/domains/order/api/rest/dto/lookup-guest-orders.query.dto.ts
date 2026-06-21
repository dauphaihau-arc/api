import { BadRequestException } from '@nestjs/common';
import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsOptional, IsString, ValidateIf, 
} from 'class-validator';

export class LookupGuestOrdersQueryDto {
  @ValidateIf((dto: LookupGuestOrdersQueryDto) => !dto.sessionId && !dto.token)
  @IsOptional()
  @ApiPropertyOptional()
  @IsEmail()
  @IsString()
  email?: string;

  @ValidateIf((dto: LookupGuestOrdersQueryDto) => !dto.sessionId && !dto.token)
  @IsOptional()
  @ApiPropertyOptional({ name: 'order_id' })
  @Expose({ name: 'order_id' })
  @Transform(({ value, obj: source }) => value ?? source.order_id)
  @IsString()
  orderId?: string;

  @ValidateIf((dto: LookupGuestOrdersQueryDto) => !dto.sessionId && !dto.token)
  @IsOptional()
  @ApiPropertyOptional({ name: 'order_ids' })
  @Expose({ name: 'order_ids' })
  @Transform(({ value, obj: source }) => value ?? source.order_ids)
  @IsString()
  orderIds?: string;

  @ValidateIf((dto: LookupGuestOrdersQueryDto) => !dto.sessionId && !dto.token)
  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  zip?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'session_id' })
  @Expose({ name: 'session_id' })
  @Transform(({ value, obj: source }) => value ?? source.session_id)
  @IsString()
  sessionId?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  token?: string;

  validate(): void {
    const hasToken = Boolean(this.token?.trim());
    const hasSessionId = Boolean(this.sessionId?.trim());
    const hasEmail = Boolean(this.email?.trim());
    const hasOrderId = Boolean(this.orderId?.trim());
    const hasOrderIds = Boolean(this.orderIds?.trim());
    const hasZip = Boolean(this.zip?.trim());

    if (hasToken && (hasSessionId || hasEmail || hasOrderId || hasOrderIds || hasZip)) {
      throw new BadRequestException(
        'token cannot be combined with other guest order lookup filters',
      );
    }

    if (hasToken) {
      return;
    }

    if (hasSessionId && (hasEmail || hasOrderId || hasOrderIds || hasZip)) {
      throw new BadRequestException(
        'session_id cannot be combined with email, order id, or zip filters',
      );
    }

    if (!hasSessionId) {
      if (!hasEmail) {
        throw new BadRequestException(
          'email is required when session_id is not provided',
        );
      }

      if (!hasOrderId && !hasOrderIds) {
        throw new BadRequestException(
          'order_id or order_ids is required when session_id is not provided',
        );
      }

      if (!hasZip) {
        throw new BadRequestException(
          'zip is required when session_id is not provided',
        );
      }
    }
  }
}
