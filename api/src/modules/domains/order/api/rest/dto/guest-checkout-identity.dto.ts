import { Expose, Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class GuestCheckoutIdentityDto {
  @Expose({ name: 'email' })
  @Transform(({ value, obj: source }) => value ?? source.email)
  @IsEmail()
  @IsString()
  @MaxLength(320)
  email!: string;
}
