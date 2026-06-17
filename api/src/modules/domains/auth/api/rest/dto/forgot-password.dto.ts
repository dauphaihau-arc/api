import { IsEmail, IsIn } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsIn(['storefront', 'seller'])
  app!: 'storefront' | 'seller';
}
