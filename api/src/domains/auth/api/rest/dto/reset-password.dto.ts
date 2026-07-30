import { IsString } from 'class-validator';
import { IsAuthPassword } from '../validation/password-validation';

export class ResetPasswordDto {
  @IsString()
  @IsAuthPassword()
  password!: string;
}
