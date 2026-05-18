import { IsString } from 'class-validator';

export class TokenQueryDto {
  @IsString()
  token!: string;
}
