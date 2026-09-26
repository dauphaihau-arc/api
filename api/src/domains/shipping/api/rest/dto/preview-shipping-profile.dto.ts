import {
  IsInt, IsString, Length, Min,
} from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PreviewShippingProfileDto {
  @ApiProperty({ name: 'country_code' })
  @Expose({ name: 'country_code' })
  @Transform(({ value, obj: source }) => value ?? source.country_code)
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}
