import {
  Expose,
  Transform,
  Type
} from 'class-transformer';
import {
  IsArray, IsBoolean, IsOptional, IsString, IsUUID, Max, Min, ValidateNested 
} from 'class-validator';

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
  @Expose({ name: 'shop_id' })
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsUUID()
  shopId!: string;

  @IsOptional()
  @Expose({ name: 'promo_codes' })
  @Transform(({ value, obj: source }) => value ?? source.promo_codes)
  @IsArray()
  @IsString({ each: true })
  promoCodes?: string[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCartItemDto {
  @IsOptional()
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;

  @IsOptional()
  @Expose({ name: 'inventory_id' })
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @Expose({ name: 'is_select_order' })
  @Transform(({ value, obj: source }) => value ?? source.is_select_order)
  @IsBoolean()
  isSelected?: boolean;

  @IsOptional()
  @Expose({ name: 'addition_info_temp_cart' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_temp_cart)
  @ValidateNested()
  @Type(() => AdditionInfoTempCartDto)
  additionInfoTempCart?: AdditionInfoTempCartDto;

  @IsOptional()
  @Expose({ name: 'addition_info_shop_carts' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_shop_carts)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionInfoShopCartDto)
  additionInfoShopCarts?: AdditionInfoShopCartDto[];
}
