import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CartProductShopRefResponseDto {
  @ApiProperty()
  slug!: string;
}

export class CartSelectedOptionResponseDto {
  @ApiProperty()
  option_id!: string;

  @ApiProperty()
  option_name!: string;

  @ApiProperty()
  value_id!: string;

  @ApiProperty()
  value!: string;
}

export class CartProductResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: CartProductShopRefResponseDto })
  @Type(() => CartProductShopRefResponseDto)
  shop!: CartProductShopRefResponseDto;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, required: false })
  image_url?: string;
}

export class CartItemInventoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  amount_minor!: number;

  @ApiProperty({ type: Number, required: false })
  original_amount_minor?: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  stock!: number;

  @ApiProperty({ type: String, required: false })
  sku?: string;

  @ApiProperty({ type: [CartSelectedOptionResponseDto] })
  @Type(() => CartSelectedOptionResponseDto)
  selected_options!: CartSelectedOptionResponseDto[];
}

export class CartProductItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  is_selected!: boolean;

  @ApiProperty()
  unit_price_minor!: number;

  @ApiProperty({ type: CartProductResponseDto })
  @Type(() => CartProductResponseDto)
  product!: CartProductResponseDto;

  @ApiProperty({ type: CartItemInventoryResponseDto })
  @Type(() => CartItemInventoryResponseDto)
  inventory!: CartItemInventoryResponseDto;
}

export class CartShopRefResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class CartShopGroupResponseDto {
  @ApiProperty({ type: CartShopRefResponseDto })
  @Type(() => CartShopRefResponseDto)
  shop!: CartShopRefResponseDto;

  @ApiProperty({ type: [CartProductItemResponseDto] })
  @Type(() => CartProductItemResponseDto)
  items!: CartProductItemResponseDto[];

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  total_minor!: number;

  @ApiProperty()
  discount_minor!: number;

  @ApiProperty()
  sale_discount_minor!: number;

  @ApiProperty()
  shipping_minor!: number;
}

export class CartRecentItemInventoryResponseDto {
  @ApiProperty({ type: [CartSelectedOptionResponseDto] })
  @Type(() => CartSelectedOptionResponseDto)
  selected_options!: CartSelectedOptionResponseDto[];
}

export class CartRecentItemResponseDto {
  @ApiProperty()
  item_id!: string;

  @ApiProperty({ type: CartProductResponseDto })
  @Type(() => CartProductResponseDto)
  product!: CartProductResponseDto;

  @ApiProperty({ type: CartRecentItemInventoryResponseDto })
  @Type(() => CartRecentItemInventoryResponseDto)
  inventory!: CartRecentItemInventoryResponseDto;

  @ApiProperty()
  quantity!: number;
}

export class CartStateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  user_id!: string;

  @ApiProperty()
  is_temp!: boolean;

  @ApiProperty({ type: [CartShopGroupResponseDto] })
  @Type(() => CartShopGroupResponseDto)
  shop_groups!: CartShopGroupResponseDto[];

  @ApiProperty({ type: [CartRecentItemResponseDto] })
  @Type(() => CartRecentItemResponseDto)
  recent_items!: CartRecentItemResponseDto[];

  @ApiProperty()
  total_quantity!: number;
}

export class CartSummaryResponseDto {
  @ApiProperty()
  currency!: string;

  @ApiProperty()
  subtotal_minor!: number;

  @ApiProperty()
  discount_minor!: number;

  @ApiProperty()
  subtotal_after_discount_minor!: number;

  @ApiProperty()
  shipping_minor!: number;

  @ApiProperty()
  total_minor!: number;

  @ApiProperty()
  total_selected_quantity!: number;

  @ApiProperty()
  total_quantity!: number;
}

export class CartCheckoutPolicyResponseDto {
  @ApiProperty()
  max_order_total_minor!: number;
}

export class CartResponseDto {
  @ApiProperty({ type: CartStateResponseDto, nullable: true })
  @Type(() => CartStateResponseDto)
  cart!: CartStateResponseDto | null;

  @ApiProperty({ enum: ['guest', 'user'], required: false })
  cart_owner_type?: 'guest' | 'user';

  @ApiProperty({ type: Boolean, required: false })
  requires_sign_in_for_checkout?: boolean;

  @ApiProperty({ type: CartCheckoutPolicyResponseDto, required: false })
  @Type(() => CartCheckoutPolicyResponseDto)
  checkout_policy?: CartCheckoutPolicyResponseDto;

  @ApiProperty({ type: CartSummaryResponseDto })
  @Type(() => CartSummaryResponseDto)
  summary!: CartSummaryResponseDto;
}
