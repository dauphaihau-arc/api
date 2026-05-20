import { IsEmail, IsString } from 'class-validator';
import { IsAuthPassword } from '../validation/password-validation';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsAuthPassword()
  password!: string;
}
