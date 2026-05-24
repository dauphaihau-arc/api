import {
  Expose,
  Transform
} from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';
import { IsAuthPassword } from '../validation/password-validation';

export class SellerRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsAuthPassword()
  password!: string;

  @Expose({ name: 'display_name' })
  @Transform(({ value, obj: source }) => value ?? source.display_name)
  @IsString()
  @MinLength(1)
  displayName!: string;

  @Expose({ name: 'shop_name' })
  @Transform(({ value, obj: source }) => value ?? source.shop_name)
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  shopName!: string;
}
