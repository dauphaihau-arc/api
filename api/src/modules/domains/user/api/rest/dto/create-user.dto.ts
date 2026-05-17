import { Expose, Transform } from 'class-transformer';
import {
  IsEmail, IsOptional, IsString, MinLength 
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @Expose({ name: 'display_name' })
  @Transform(({ value, obj: source }) => value ?? source.display_name)
  @IsString()
  displayName?: string;
}
