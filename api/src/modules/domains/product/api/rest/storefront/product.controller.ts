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
import { ListPublicProductReviewImagesUseCase } from '../../../app/use-cases/list-public-product-review-images/list-public-product-review-images.use-case';
import { ListPublicProductsUseCase } from '../../../app/use-cases/list-public-products/list-public-products.use-case';
import { SuggestPublicProductsUseCase } from '../../../app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { ListPublicProductReviewsUseCase } from '../../../app/use-cases/list-public-product-reviews/list-public-product-reviews.use-case';
import { ListPublicProductReviewImagesQueryDto } from './dto/list-public-product-review-images.query.dto';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';
import { ListPublicProductReviewsQueryDto } from './dto/list-public-product-reviews.query.dto';
import { ListPublicProductsQueryPipe } from './list-public-products-query.pipe';
import { SuggestPublicProductsQueryDto } from './dto/suggest-public-products.query.dto';
import { toPublicProductDetailResponse } from './presenters/public-product-detail.presenter';
import type { PublicProductDetailResponse } from './responses/public-product-detail.response';
import { toPublicProductListResponse } from './presenters/public-product-list.presenter';
import type { PublicProductListResponse } from './responses/public-product-list.response';
import { toPublicProductFacetResponse } from './presenters/public-product-facet.presenter';
import type { PublicProductFacetResponse } from './responses/public-product-facet.response';
import { toPublicProductReviewImageListResponse } from './presenters/public-product-review-image-list.presenter';
import type { PublicProductReviewImageListResponse } from './responses/public-product-review-image-list.response';
import { toPublicProductReviewListResponse } from './presenters/public-product-review-list.presenter';
import type { PublicProductReviewListResponse } from './responses/public-product-review-list.response';
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
    private readonly suggestPublicProductsUseCase: SuggestPublicProductsUseCase,
    private readonly listPublicProductReviewsUseCase: ListPublicProductReviewsUseCase,
    private readonly listPublicProductReviewImagesUseCase: ListPublicProductReviewImagesUseCase,
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

  @Get('by-slug/:shop_slug/:product_slug/reviews')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'List public product reviews' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Public product reviews.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Product was not found.' })
  async listProductReviews(
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
    @Query() query: ListPublicProductReviewsQueryDto,
  ): Promise<PublicProductReviewListResponse> {
    const result = await this.listPublicProductReviewsUseCase.execute({
      shopSlug,
      productSlug,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      rating: query.rating,
      hasImages: query.hasImages,
      hasComment: query.hasComment,
    });

    if (!result) {
      throw new NotFoundException('Product was not found');
    }

    return toPublicProductReviewListResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug/review-images')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'List public product review images' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Public product review images.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Product was not found.' })
  async listProductReviewImages(
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
    @Query() query: ListPublicProductReviewImagesQueryDto,
  ): Promise<PublicProductReviewImageListResponse> {
    const result = await this.listPublicProductReviewImagesUseCase.execute({
      shopSlug,
      productSlug,
      limit: query.limit,
      cursor: query.cursor,
    });

    if (!result) {
      throw new NotFoundException('Product was not found');
    }

    return toPublicProductReviewImageListResponse(result);
  }
}
