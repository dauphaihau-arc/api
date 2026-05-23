import { Expose, Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class UpdateAdminOrderSupportNoteDto {
  @IsOptional()
  @Expose({ name: 'support_note' })
  @Transform(({ value, obj: source }) => value ?? source.support_note)
  @IsString()
  @MaxLength(5000)
  supportNote?: string;
}
