import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignProductShippingProfileDto {
  @ApiPropertyOptional({ name: 'shipping_profile_id', nullable: true })
  @Expose({ name: 'shipping_profile_id' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_profile_id)
  @IsOptional()
  @IsString()
  @IsUUID()
  shippingProfileId?: string | null;
}
