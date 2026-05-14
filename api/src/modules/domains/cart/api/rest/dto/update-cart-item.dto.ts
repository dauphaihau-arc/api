import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

class AdditionInfoTempCartDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  promoCodes?: string[];

  @IsOptional()
  @IsString()
  note?: string;
}

class AdditionInfoShopCartDto {
  @Transform(({ value, obj }) => value ?? obj.shop_id)
  @IsUUID()
  shopId!: string;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.promo_codes)
  @IsArray()
  @IsString({ each: true })
  promoCodes?: string[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCartItemDto {
  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.cart_id)
  @IsUUID()
  cartId?: string;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.inventory_id)
  @IsUUID()
  inventoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.is_select_order)
  @IsBoolean()
  isSelected?: boolean;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.addition_info_temp_cart)
  @ValidateNested()
  @Type(() => AdditionInfoTempCartDto)
  additionInfoTempCart?: AdditionInfoTempCartDto;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.addition_info_shop_carts)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionInfoShopCartDto)
  additionInfoShopCarts?: AdditionInfoShopCartDto[];
}
