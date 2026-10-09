import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';

export class PublicProductShopResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  shop_name!: string;

  @ApiProperty()
  slug!: string;
}

export class PublicProductCategoryPathResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class PublicProductDetailReviewSummaryResponseDto {
  @ApiProperty()
  average!: number;

  @ApiProperty()
  count!: number;
}

export class PublicProductImageVariantResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty({ required: false })
  width?: number;

  @ApiProperty({ required: false })
  height?: number;

  @ApiProperty({ required: false })
  format?: string;
}

export class PublicProductImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty()
  variant_status!: string;

  @ApiProperty({ required: false })
  variant_error?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  variants_generated_at?: Date;

  @ApiPropertyOptional({
    type: Object,
    description: 'Named image variants keyed by variant name.',
  })
  variants?: Record<string, PublicProductImageVariantResponseDto>;
}

export class PublicProductOptionValueResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  position!: number;
}

export class PublicProductOptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty({ type: [PublicProductOptionValueResponseDto] })
  @Type(() => PublicProductOptionValueResponseDto)
  values!: PublicProductOptionValueResponseDto[];
}

export class PublicProductVariantSelectionResponseDto {
  @ApiProperty()
  option_id!: string;

  @ApiProperty()
  value_id!: string;
}

export class PublicProductVariantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [PublicProductVariantSelectionResponseDto] })
  @Type(() => PublicProductVariantSelectionResponseDto)
  selections!: PublicProductVariantSelectionResponseDto[];

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty()
  rank!: number;
}

export class PublicProductInventoryAutoSaleResponseDto {
  @ApiProperty()
  promotion_id!: string;

  @ApiProperty()
  percent_off!: number;
}

export class PublicProductInventoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false })
  product_variant_id?: string;

  @ApiProperty({ required: false })
  sku?: string;

  @ApiProperty()
  stock!: number;

  @ApiProperty()
  on_hand_quantity!: number;

  @ApiProperty()
  reserved_quantity!: number;

  @ApiProperty()
  available_quantity!: number;

  @ApiProperty()
  on_hand_version!: number;

  @ApiProperty()
  shortage!: number;

  @ApiProperty({ required: false })
  amount_minor?: number;

  @ApiProperty({ required: false })
  original_amount_minor?: number;

  @ApiProperty({ required: false })
  currency?: string;

  @ApiProperty({ type: PublicProductInventoryAutoSaleResponseDto, required: false })
  @Type(() => PublicProductInventoryAutoSaleResponseDto)
  auto_sale?: PublicProductInventoryAutoSaleResponseDto;
}

export class PublicProductShippingDestinationResponseDto {
  @ApiProperty({ enum: ['country', 'everywhere_else'] })
  destination_scope!: 'country' | 'everywhere_else';

  @ApiProperty({ required: false })
  destination_country?: string;
}

export class PublicProductShippingResponseDto {
  @ApiProperty({ type: [PublicProductShippingDestinationResponseDto] })
  @Type(() => PublicProductShippingDestinationResponseDto)
  destinations!: PublicProductShippingDestinationResponseDto[];
}

export class PublicProductDetailResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: PublicProductShopResponseDto })
  @Type(() => PublicProductShopResponseDto)
  shop!: PublicProductShopResponseDto;

  @ApiProperty({ required: false })
  category_id?: string;

  @ApiProperty({ type: [PublicProductCategoryPathResponseDto], required: false })
  @Type(() => PublicProductCategoryPathResponseDto)
  category_path?: PublicProductCategoryPathResponseDto[];

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: ProductWhoMade })
  who_made!: ProductWhoMade;

  @ApiProperty()
  is_digital!: boolean;

  @ApiProperty()
  stock_notice_threshold!: number;

  @ApiProperty({ type: PublicProductDetailReviewSummaryResponseDto })
  @Type(() => PublicProductDetailReviewSummaryResponseDto)
  review_summary!: PublicProductDetailReviewSummaryResponseDto;

  @ApiProperty({ type: [PublicProductImageResponseDto] })
  @Type(() => PublicProductImageResponseDto)
  images!: PublicProductImageResponseDto[];

  @ApiProperty({ type: [PublicProductOptionResponseDto] })
  @Type(() => PublicProductOptionResponseDto)
  options!: PublicProductOptionResponseDto[];

  @ApiProperty({ type: [PublicProductVariantResponseDto] })
  @Type(() => PublicProductVariantResponseDto)
  variants!: PublicProductVariantResponseDto[];

  @ApiProperty({ type: [PublicProductInventoryResponseDto] })
  @Type(() => PublicProductInventoryResponseDto)
  inventory!: PublicProductInventoryResponseDto[];

  @ApiProperty({ type: PublicProductShippingResponseDto, required: false })
  @Type(() => PublicProductShippingResponseDto)
  shipping?: PublicProductShippingResponseDto;
}

export class PublicProductListItemImageVariantResponseDto {
  @ApiProperty({ required: false })
  url?: string;
}

export class PublicProductListItemImageResponseDto {
  @ApiProperty({ required: false })
  url?: string;

  @ApiProperty({ required: false })
  variant?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Named image variants keyed by variant name.',
  })
  variants?: Record<string, PublicProductListItemImageVariantResponseDto>;
}

export class PublicProductListItemAutoSaleResponseDto {
  @ApiProperty()
  promotion_id!: string;

  @ApiProperty()
  percent_off!: number;
}

export class PublicProductListItemPricingResponseDto {
  @ApiProperty({ required: false })
  min_amount_minor?: number;

  @ApiProperty({ required: false })
  max_amount_minor?: number;

  @ApiProperty({ required: false })
  original_min_amount_minor?: number;

  @ApiProperty({ required: false })
  original_max_amount_minor?: number;

  @ApiProperty({ required: false })
  currency?: string;

  @ApiProperty({ type: PublicProductListItemAutoSaleResponseDto, required: false })
  @Type(() => PublicProductListItemAutoSaleResponseDto)
  auto_sale?: PublicProductListItemAutoSaleResponseDto;
}

export class PublicProductAvailabilityResponseDto {
  @ApiProperty()
  in_stock!: boolean;

  @ApiProperty()
  low_stock!: boolean;

  @ApiProperty()
  stock_total!: number;
}

export class PublicProductListItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: PublicProductShopResponseDto })
  @Type(() => PublicProductShopResponseDto)
  shop!: PublicProductShopResponseDto;

  @ApiProperty({ required: false })
  category_id?: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: PublicProductListItemImageResponseDto, required: false })
  @Type(() => PublicProductListItemImageResponseDto)
  image?: PublicProductListItemImageResponseDto;

  @ApiProperty({ type: PublicProductListItemPricingResponseDto, required: false })
  @Type(() => PublicProductListItemPricingResponseDto)
  pricing?: PublicProductListItemPricingResponseDto;

  @ApiProperty({ type: PublicProductAvailabilityResponseDto })
  @Type(() => PublicProductAvailabilityResponseDto)
  availability!: PublicProductAvailabilityResponseDto;

  @ApiProperty()
  variant_count!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class PaginationMetaResponseDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  has_next_page!: boolean;

  @ApiProperty()
  has_previous_page!: boolean;
}

export class PublicProductListResponseDto {
  @ApiProperty({ type: [PublicProductListItemResponseDto] })
  @Type(() => PublicProductListItemResponseDto)
  items!: PublicProductListItemResponseDto[];

  @ApiProperty({ type: PaginationMetaResponseDto })
  @Type(() => PaginationMetaResponseDto)
  meta!: PaginationMetaResponseDto;
}

export class PublicProductSuggestionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: PublicProductShopResponseDto })
  @Type(() => PublicProductShopResponseDto)
  shop!: PublicProductShopResponseDto;
}

export class PublicProductSuggestionListResponseDto {
  @ApiProperty({ type: [PublicProductSuggestionResponseDto] })
  @Type(() => PublicProductSuggestionResponseDto)
  items!: PublicProductSuggestionResponseDto[];
}

export class PublicProductFacetOptionResponseDto {
  @ApiProperty()
  option_key!: string;

  @ApiProperty()
  value!: string;
}

export class PublicProductFacetItemResponseDto {
  @ApiProperty()
  facet_key!: string;

  @ApiProperty()
  attribute_name!: string;

  @ApiProperty({ type: [PublicProductFacetOptionResponseDto] })
  @Type(() => PublicProductFacetOptionResponseDto)
  options!: PublicProductFacetOptionResponseDto[];
}

export class PublicProductFacetResponseDto {
  @ApiProperty({ type: [PublicProductFacetItemResponseDto] })
  @Type(() => PublicProductFacetItemResponseDto)
  facets!: PublicProductFacetItemResponseDto[];
}

export class PublicProductReviewBreakdownResponseDto {
  @ApiProperty({ name: '1' })
  one!: number;

  @ApiProperty({ name: '2' })
  two!: number;

  @ApiProperty({ name: '3' })
  three!: number;

  @ApiProperty({ name: '4' })
  four!: number;

  @ApiProperty({ name: '5' })
  five!: number;
}

export class PublicProductReviewSummaryFiltersResponseDto {
  @ApiProperty()
  has_images!: number;

  @ApiProperty()
  has_comment!: number;
}

export class PublicProductReviewSummaryResponseDto {
  @ApiProperty()
  average!: number;

  @ApiProperty()
  count!: number;

  @ApiProperty({ type: PublicProductReviewBreakdownResponseDto })
  @Type(() => PublicProductReviewBreakdownResponseDto)
  breakdown!: PublicProductReviewBreakdownResponseDto;

  @ApiProperty({ type: PublicProductReviewSummaryFiltersResponseDto })
  @Type(() => PublicProductReviewSummaryFiltersResponseDto)
  filters!: PublicProductReviewSummaryFiltersResponseDto;
}

export class PublicProductReviewImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  rank!: number;

  @ApiPropertyOptional({
    type: Object,
    description: 'Named image variants keyed by variant name.',
  })
  variants?: Record<string, PublicProductImageVariantResponseDto>;
}

export class PublicProductReviewAuthorResponseDto {
  @ApiProperty()
  display_name!: string;
}

export class PublicProductReviewItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  rating!: number;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  body?: string;

  @ApiProperty({ type: PublicProductReviewImageResponseDto, required: false })
  @Type(() => PublicProductReviewImageResponseDto)
  image?: PublicProductReviewImageResponseDto;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;

  @ApiProperty()
  verified_purchase!: boolean;

  @ApiProperty({ type: PublicProductReviewAuthorResponseDto })
  @Type(() => PublicProductReviewAuthorResponseDto)
  author!: PublicProductReviewAuthorResponseDto;
}

export class PublicProductReviewListResponseDto {
  @ApiProperty({ type: PublicProductReviewSummaryResponseDto })
  @Type(() => PublicProductReviewSummaryResponseDto)
  summary!: PublicProductReviewSummaryResponseDto;

  @ApiProperty({ type: [PublicProductReviewItemResponseDto] })
  @Type(() => PublicProductReviewItemResponseDto)
  items!: PublicProductReviewItemResponseDto[];

  @ApiProperty({ type: PaginationMetaResponseDto })
  @Type(() => PaginationMetaResponseDto)
  meta!: PaginationMetaResponseDto;
}

export class PublicProductReviewImageListItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty()
  review_id!: string;

  @ApiProperty({ required: false })
  review_title?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiPropertyOptional({
    type: Object,
    description: 'Named image variants keyed by variant name.',
  })
  variants?: Record<string, PublicProductImageVariantResponseDto>;

  @ApiProperty({ type: PublicProductReviewAuthorResponseDto })
  @Type(() => PublicProductReviewAuthorResponseDto)
  author!: PublicProductReviewAuthorResponseDto;
}

export class PublicProductReviewImageListMetaResponseDto {
  @ApiProperty({ required: false })
  next_cursor?: string;

  @ApiProperty()
  has_more!: boolean;
}

export class PublicProductReviewImageListResponseDto {
  @ApiProperty({ type: [PublicProductReviewImageListItemResponseDto] })
  @Type(() => PublicProductReviewImageListItemResponseDto)
  items!: PublicProductReviewImageListItemResponseDto[];

  @ApiProperty({ type: PublicProductReviewImageListMetaResponseDto })
  @Type(() => PublicProductReviewImageListMetaResponseDto)
  meta!: PublicProductReviewImageListMetaResponseDto;
}
