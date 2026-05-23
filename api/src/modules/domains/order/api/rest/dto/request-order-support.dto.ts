import { Expose, Transform } from 'class-transformer';
import {
  IsString,
  MaxLength
} from 'class-validator';

export class RequestOrderSupportDto {
  @Expose({ name: 'support_note' })
  @Transform(({ value, obj: source }) => value ?? source.support_note)
  @IsString()
  @MaxLength(5000)
  supportNote!: string;
}
