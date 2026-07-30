import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
} from 'class-validator';

export class RequestOrderSupportDto {
  @ApiProperty({ name: 'support_note', maxLength: 5000 })
  @Expose({ name: 'support_note' })
  @Transform(({ value, obj: source }) => value ?? source.support_note)
  @IsString()
  @MaxLength(5000)
  supportNote!: string;
}
