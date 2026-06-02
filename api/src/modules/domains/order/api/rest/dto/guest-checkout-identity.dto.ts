import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class GuestCheckoutIdentityDto {
  @ApiProperty()
  @Expose({ name: 'email' })
  @Transform(({ value, obj: source }) => value ?? source.email)
  @IsEmail()
  @IsString()
  @MaxLength(320)
  email!: string;
}
