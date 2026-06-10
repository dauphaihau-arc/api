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
import { SuggestPublicProductsUseCase } from '../../app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';
import { SuggestPublicProductsQueryDto } from './dto/suggest-public-products.query.dto';
import { toPublicProductDetailResponse } from './public-product-detail.presenter';
import type { PublicProductDetailResponse } from './public-product-detail.response';
import { toPublicProductListResponse } from './public-product-list.presenter';
import type { PublicProductListResponse } from './public-product-list.response';
import { toPublicProductSuggestionResponse } from './public-product-suggestion.presenter';
import type { PublicProductSuggestionResponse } from './public-product-suggestion.response';

@Controller('products')
@ApiTags('Products')
export class ProductController {
  constructor(
    private readonly listPublicProductsUseCase: ListPublicProductsUseCase,
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase,
    private readonly suggestPublicProductsUseCase: SuggestPublicProductsUseCase
  ) {}

  @Get('suggestions')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Suggest public products for typeahead' })
  @ApiOkResponse({
    description: 'Matching public product suggestions.',
    schema: { type: 'object' },
  })
  async suggestProducts(
    @Query() query: SuggestPublicProductsQueryDto
  ): Promise<{ items: PublicProductSuggestionResponse[] }> {
    const result = await this.suggestPublicProductsUseCase.execute(
      query.search,
      query.limit
    );

    return { items: result.map(toPublicProductSuggestionResponse) };
  }

  @Get()
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
