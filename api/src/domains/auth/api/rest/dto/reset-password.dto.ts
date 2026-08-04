import { IsIn, IsString } from 'class-validator';
import type { AuthPortal } from '../../../app/portal-access';
import { IsAuthPassword } from '../validation/password-validation';

export class ResetPasswordDto {
  @IsString()
  @IsAuthPassword()
  password!: string;

  @IsIn(['storefront', 'seller', 'admin'])
  app!: AuthPortal;
}
