import {
  Expose,
  Transform,
  Type
} from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsOptional, IsString, IsUUID, Max, Min, ValidateNested 
} from 'class-validator';

class AdditionInfoTempCartDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'promo_codes', type: [String] })
  @Expose({ name: 'promo_codes' })
  @Transform(({ value, obj: source }) => value ?? source.promo_codes)
  @IsArray()
  @IsString({ each: true })
  promo_codes?: string[];

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  note?: string;
}

class AdditionInfoShopCartDto {
  @ApiPropertyOptional({ name: 'shop_id' })
  @Expose({ name: 'shop_id' })
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsUUID()
  shopId!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'promo_codes', type: [String] })
  @Expose({ name: 'promo_codes' })
  @Transform(({ value, obj: source }) => value ?? source.promo_codes)
  @IsArray()
  @IsString({ each: true })
  promoCodes?: string[];

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  note?: string;
}

export class UpdateCartItemDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'cart_id' })
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'inventory_id' })
  @Expose({ name: 'inventory_id' })
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(0)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'is_select_order' })
  @Expose({ name: 'is_select_order' })
  @Transform(({ value, obj: source }) => value ?? source.is_select_order)
  @IsBoolean()
  isSelected?: boolean;

  @IsOptional()
  @ApiPropertyOptional({ name: 'addition_info_temp_cart', type: AdditionInfoTempCartDto })
  @Expose({ name: 'addition_info_temp_cart' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_temp_cart)
  @ValidateNested()
  @Type(() => AdditionInfoTempCartDto)
  additionInfoTempCart?: AdditionInfoTempCartDto;

  @IsOptional()
  @ApiPropertyOptional({
    name: 'addition_info_shop_carts',
    type: [AdditionInfoShopCartDto],
  })
  @Expose({ name: 'addition_info_shop_carts' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_shop_carts)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionInfoShopCartDto)
  additionInfoShopCarts?: AdditionInfoShopCartDto[];
}
