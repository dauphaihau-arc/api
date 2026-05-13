import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateShopDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  shop_name!: string;
}
