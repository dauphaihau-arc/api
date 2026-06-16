import {
  Controller, Get, Header, NotFoundException, Param, Query, UseGuards
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '~/modules/domains/auth/api/guard/optional-jwt-auth.guard';
import { GetPublicProductBySlugsUseCase } from '../../../app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { ListPublicProductsUseCase } from '../../../app/use-cases/list-public-products/list-public-products.use-case';
import { SuggestPublicProductsUseCase } from '../../../app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';
import { ListPublicProductsQueryPipe } from './list-public-products-query.pipe';
import { SuggestPublicProductsQueryDto } from './dto/suggest-public-products.query.dto';
import { toPublicProductDetailResponse } from './presenters/public-product-detail.presenter';
import type { PublicProductDetailResponse } from './responses/public-product-detail.response';
import { toPublicProductListResponse } from './presenters/public-product-list.presenter';
import type { PublicProductListResponse } from './responses/public-product-list.response';
import { toPublicProductFacetResponse } from './presenters/public-product-facet.presenter';
import type { PublicProductFacetResponse } from './responses/public-product-facet.response';
import { toPublicProductSuggestionResponse } from './presenters/public-product-suggestion.presenter';
import type { PublicProductSuggestionResponse } from './responses/public-product-suggestion.response';

@Controller('products')
@ApiTags('Products')
@UseGuards(OptionalJwtAuthGuard)
export class ProductController {
  private readonly listPublicProductsQueryPipe = new ListPublicProductsQueryPipe();

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
    @Query() rawQuery: Record<string, unknown>
  ): Promise<PublicProductListResponse> {
    const query = await this.listPublicProductsQueryPipe.transform(rawQuery, {
      type: 'query',
      metatype: ListPublicProductsQueryDto,
      data: undefined,
    });
    const result = await this.listPublicProductsUseCase.execute(query);

    return toPublicProductListResponse(result);
  }

  @Get('facets')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'List public product facets' })
  @ApiOkResponse({
    description: 'Public product facets.',
    schema: { type: 'object' },
  })
  async listProductFacets(
    @Query() rawQuery: Record<string, unknown>
  ): Promise<PublicProductFacetResponse> {
    const query = await this.listPublicProductsQueryPipe.transform(rawQuery, {
      type: 'query',
      metatype: ListPublicProductsQueryDto,
      data: undefined,
    });
    const result = await this.listPublicProductsUseCase.executeFacets(query);

    return toPublicProductFacetResponse(result);
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
