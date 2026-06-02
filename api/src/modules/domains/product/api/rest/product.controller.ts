import {
  Controller, Get, Header, NotFoundException, Param, Query
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { GetPublicProductBySlugsUseCase } from '../../app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { ListPublicProductsUseCase } from '../../app/use-cases/list-public-products/list-public-products.use-case';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';
import { toPublicProductDetailResponse } from './public-product-detail.presenter';
import type { PublicProductDetailResponse } from './public-product-detail.response';
import { toPublicProductListResponse } from './public-product-list.presenter';
import type { PublicProductListResponse } from './public-product-list.response';

@Controller('products')
@ApiTags('Products')
export class ProductController {
  constructor(
    private readonly listPublicProductsUseCase: ListPublicProductsUseCase,
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase
  ) {}

  @Get()
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'List public products' })
  @ApiOkResponse({
    description: 'Public product list.',
    schema: { type: 'object' },
  })
  async listProducts(
    @Query() query: ListPublicProductsQueryDto
  ): Promise<PublicProductListResponse> {
    const result = await this.listPublicProductsUseCase.execute(query);

    return toPublicProductListResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug')
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Get a public product by shop slug and product slug' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Public product detail.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Product was not found.' })
  async productBySlugs(
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string
  ): Promise<PublicProductDetailResponse> {
    const product = await this.getPublicProductBySlugsUseCase.execute(
      shopSlug,
      productSlug
    );

    if (!product) {
      throw new NotFoundException('Product was not found');
    }

    return toPublicProductDetailResponse(product);
  }
}
