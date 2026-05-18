import { IsIn, IsString } from 'class-validator';

const supportedTokenTypes = ['resetPassword'] as const;

export class VerifyTokenDto {
  @IsString()
  token!: string;

  @IsString()
  @IsIn(supportedTokenTypes)
  type!: (typeof supportedTokenTypes)[number];
}
