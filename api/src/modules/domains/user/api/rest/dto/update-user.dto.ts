import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsOptional, IsString, Min 
} from 'class-validator';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';

export class UpdateUserDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @Expose({ name: 'display_name' })
  @Transform(({ value, obj: source }) => value ?? source.display_name)
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
