import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class UpdateAdminOrderSupportNoteDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'support_note', maxLength: 5000 })
  @Expose({ name: 'support_note' })
  @Transform(({ value, obj: source }) => value ?? source.support_note)
  @IsString()
  @MaxLength(5000)
  supportNote?: string;
}
