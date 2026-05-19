import {
  Controller, Get, Header, NotFoundException, Param, Query 
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type {
  PublicProductDetail,
  PublicProductListResult
} from '../../app/product.types';
import { GetPublicProductByIdUseCase } from '../../app/use-cases/get-public-product-by-id/get-public-product-by-id.use-case';
import { ListPublicProductsUseCase } from '../../app/use-cases/list-public-products/list-public-products.use-case';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';

type PublicProductDetailResponse = {
  id: string;
  shop: {
    id: string;
    public_id?: string;
    shop_name: string;
  };
  category_id?: string;
  title: string;
  slug: string;
  description: string;
  who_made: PublicProductDetail['whoMade'];
  is_digital: boolean;
  variant_type?: PublicProductDetail['variantType'];
  variant_group_name?: string;
  variant_sub_group_name?: string;
  images: Array<{
    id: string;
    storage_key: string;
    url?: string;
    rank: number;
  }>;
  variants: Array<{
    id: string;
    name: string;
    option_value_1?: string;
    option_value_2?: string;
    image_storage_key?: string;
    rank: number;
  }>;
  inventory: Array<{
    id: string;
    product_variant_id?: string;
    sku?: string;
    stock: number;
    price: number;
    sale_price?: number;
  }>;
  shipping?: {
    origin_country: string;
    process_time_label: string;
    destinations: Array<{
      id: string;
      country_code: string;
      delivery_time_label: string;
      service: string;
      charge_type: PublicProductDetail['shipping'] extends undefined
        ? never
        : NonNullable<PublicProductDetail['shipping']>['destinations'][number]['chargeType'];
      rank: number;
    }>;
  };
};

const toPublicProductDetailResponse = (
  product: PublicProductDetail
): PublicProductDetailResponse => ({
  id: product.id,
  shop: {
    id: product.shop.id,
    public_id: product.shop.publicId,
    shop_name: product.shop.shopName,
  },
  category_id: product.categoryId,
  title: product.title,
  slug: product.slug,
  description: product.description,
  who_made: product.whoMade,
  is_digital: product.isDigital,
  variant_type: product.variantType,
  variant_group_name: product.variantGroupName,
  variant_sub_group_name: product.variantSubGroupName,
  images: product.images.map((image) => ({
    id: image.id,
    storage_key: image.storageKey,
    url: image.url,
    rank: image.rank,
  })),
  variants: product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    option_value_1: variant.optionValue1,
    option_value_2: variant.optionValue2,
    image_storage_key: variant.imageStorageKey,
    rank: variant.rank,
  })),
  inventory: product.inventory.map((inventory) => ({
    id: inventory.id,
    product_variant_id: inventory.productVariantId,
    sku: inventory.sku,
    stock: inventory.stock,
    price: inventory.price,
    sale_price: inventory.salePrice,
  })),
  shipping: product.shipping
    ? {
        origin_country: product.shipping.originCountry,
        process_time_label: product.shipping.processTimeLabel,
        destinations: product.shipping.destinations.map((destination) => ({
          id: destination.id,
          country_code: destination.countryCode,
          delivery_time_label: destination.deliveryTimeLabel,
          service: destination.service,
          charge_type: destination.chargeType,
          rank: destination.rank,
        })),
      }
    : undefined,
});

@Controller('products')
export class ProductController {
  constructor(
    private readonly listPublicProductsUseCase: ListPublicProductsUseCase,
    private readonly getPublicProductByIdUseCase: GetPublicProductByIdUseCase
  ) {}

  @Get()
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=60')
  listProducts(
    @Query() query: ListPublicProductsQueryDto
  ): Promise<PublicProductListResult> {
    return this.listPublicProductsUseCase.execute(query);
  }

  @Get(':id')
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=60')
  async product(@Param('id') id: string): Promise<PublicProductDetailResponse> {
    const product = await this.getPublicProductByIdUseCase.execute(id);

    if (!product) {
      throw new NotFoundException('Product was not found');
    }

    return toPublicProductDetailResponse(product);
  }
}
