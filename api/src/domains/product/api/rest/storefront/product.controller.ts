import {
  Controller, Get, Header, NotFoundException, Param, Query, Req, Res, UseGuards, applyDecorators,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { OptionalJwtAuthGuard } from '~/domains/auth/api/guard/optional-jwt-auth.guard';
import {
  PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT,
  PRODUCT_PUBLIC_LIST_DEFAULT_PAGE,
  PRODUCT_PUBLIC_LIST_MAX_LIMIT,
} from '~/domains/product/app/product.constants';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { CATEGORY_PUBLIC_ID_PATTERN } from '~/domains/category/app/category-public-id';
import { productControllerErrorResponses } from '../errors/product-error-responses';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { Request, Response } from 'express';
import { GetPublicProductBySlugsUseCase } from '../../../app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { ListPublicProductFacetsUseCase } from '../../../app/use-cases/list-public-product-facets/list-public-product-facets.use-case';
import { ListPublicProductReviewImagesUseCase } from '../../../app/use-cases/list-public-product-review-images/list-public-product-review-images.use-case';
import { ListPublicProductsUseCase } from '../../../app/use-cases/list-public-products/list-public-products.use-case';
import { SuggestPublicProductsUseCase } from '../../../app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { ListPublicProductReviewsUseCase } from '../../../app/use-cases/list-public-product-reviews/list-public-product-reviews.use-case';
import { ListPublicProductReviewImagesQueryDto } from './dto/list-public-product-review-images.query.dto';
import { ListPublicProductsQueryDto, PUBLIC_PRODUCT_SORT_ORDERS } from './dto/list-public-products.query.dto';
import { ListPublicProductReviewsQueryDto } from './dto/list-public-product-reviews.query.dto';
import { ListPublicProductsQueryPipe } from './pipes/list-public-products-query.pipe';
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
import {
  PublicProductDetailResponseDto,
  PublicProductFacetResponseDto,
  PublicProductListResponseDto,
  PublicProductReviewImageListResponseDto,
  PublicProductReviewListResponseDto,
  PublicProductSuggestionListResponseDto,
} from './responses/public-product-response.dto';

const STOREFRONT_CACHE_VARY_HEADER = 'x-market-code, x-currency, x-locale, x-channel';
const PUBLIC_STOREFRONT_CACHE_CONTROL = 'public, max-age=60';
const PRIVATE_STOREFRONT_CACHE_CONTROL = 'private, no-store';
type ProductRequest = Request & { user?: AuthenticatedUser | null };

function setStorefrontProductCacheControl(response: Response, request: ProductRequest) {
  response.setHeader(
    'Cache-Control',
    request.user ? PRIVATE_STOREFRONT_CACHE_CONTROL : PUBLIC_STOREFRONT_CACHE_CONTROL,
  );
}

/**
 * Documents the query surface `ListPublicProductsQueryPipe` accepts. Both the
 * product list and the facet list run the same pipe, so they must advertise
 * the same parameters.
 */
function ApiListPublicProductsQueries() {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: 'number',
      minimum: 1,
      default: PRODUCT_PUBLIC_LIST_DEFAULT_PAGE,
      description: 'Page number, 1-based.',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: 'number',
      minimum: 1,
      maximum: PRODUCT_PUBLIC_LIST_MAX_LIMIT,
      default: PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT,
      description: 'Page size.',
    }),
    ApiQuery({
      name: 'category_id',
      required: false,
      type: 'string',
      pattern: CATEGORY_PUBLIC_ID_PATTERN.source,
      description:
        'Category public id; matches products in that category and its descendants.',
    }),
    ApiQuery({
      name: 'search',
      required: false,
      type: 'string',
      description: 'Free-text search over product titles.',
    }),
    ApiQuery({
      name: 's',
      required: false,
      type: 'string',
      deprecated: true,
      description:
        'Deprecated alias of `search`; when supplied it takes precedence over `search`.',
    }),
    ApiQuery({
      name: 'title',
      required: false,
      type: 'string',
      description: 'Title substring filter.',
    }),
    ApiQuery({
      name: 'is_digital',
      required: false,
      type: 'boolean',
      description: 'Restrict to digital (`true`) or physical (`false`) products.',
    }),
    ApiQuery({
      name: 'who_made',
      required: false,
      type: 'string',
      enum: ProductWhoMade,
      description: 'Maker attribution filter.',
    }),
    ApiQuery({
      name: 'min_price',
      required: false,
      type: 'integer',
      minimum: 0,
      description: 'Minimum price in minor units, inclusive.',
    }),
    ApiQuery({
      name: 'max_price',
      required: false,
      type: 'integer',
      minimum: 0,
      description: 'Maximum price in minor units, inclusive.',
    }),
    ApiQuery({
      name: 'order',
      required: false,
      type: 'string',
      enum: PUBLIC_PRODUCT_SORT_ORDERS,
      description: 'Sort order.',
    }),
    ApiQuery({
      name: 'attr_{attribute_id}',
      required: false,
      type: 'string',
      isArray: true,
      description:
        'Attribute filter, one parameter per attribute where `{attribute_id}` is ' +
        'the attribute id. Repeat the parameter (or pass a comma-separated ' +
        'value) to match any of several option values. Dynamic name: any ' +
        '`attr_*` parameter is accepted, and other unknown parameters are ' +
        'rejected.',
    }),
  );
}

@Controller('products')
@ApiTags('Products')
@UseGuards(OptionalJwtAuthGuard)
@ApiErrorResponses(productControllerErrorResponses.common)
export class ProductController {
  private readonly listPublicProductsQueryPipe = new ListPublicProductsQueryPipe();

  constructor(
    private readonly listPublicProductsUseCase: ListPublicProductsUseCase,
    private readonly listPublicProductFacetsUseCase: ListPublicProductFacetsUseCase,
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase,
    private readonly suggestPublicProductsUseCase: SuggestPublicProductsUseCase,
    private readonly listPublicProductReviewsUseCase: ListPublicProductReviewsUseCase,
    private readonly listPublicProductReviewImagesUseCase: ListPublicProductReviewImagesUseCase,
  ) {}

  @Get('suggestions')
  @Header('Cache-Control', 'public, max-age=30')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'Suggest products',
    description: 'Returns public product suggestions for typeahead search.',
  })
  @ApiErrorResponses(productControllerErrorResponses.suggestions)
  @ApiOkResponse({
    description: 'Matching public product suggestions.',
    type: PublicProductSuggestionListResponseDto,
  })
  async suggestProducts(
    @Query() query: SuggestPublicProductsQueryDto,
  ): Promise<{ items: PublicProductSuggestionResponse[] }> {
    const result = await this.suggestPublicProductsUseCase.execute(
      query.search,
      query.limit,
    );

    return { items: result.map(toPublicProductSuggestionResponse) };
  }

  @Get()
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'List products',
    description:
      'Returns public products matching the supplied filters. Any query ' +
      'parameter other than those listed here is rejected with ' +
      '`VALIDATION_FAILED`; attribute filters are passed as ' +
      '`attr_<attribute_id>` parameters.',
  })
  @ApiListPublicProductsQueries()
  @ApiErrorResponses(productControllerErrorResponses.list)
  @ApiOkResponse({
    description: 'Public product list.',
    type: PublicProductListResponseDto,
  })
  async listProducts(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<PublicProductListResponse> {
    setStorefrontProductCacheControl(response, request);

    const query = await this.listPublicProductsQueryPipe.transform(rawQuery, {
      type: 'query',
      metatype: ListPublicProductsQueryDto,
      data: undefined,
    });
    const result = await this.listPublicProductsUseCase.execute(query);

    return toPublicProductListResponse(result);
  }

  @Get('facets')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'List product facets',
    description: 'Returns facets for filtering public products.',
  })
  @ApiListPublicProductsQueries()
  @ApiErrorResponses(productControllerErrorResponses.facets)
  @ApiOkResponse({
    description: 'Public product facets.',
    type: PublicProductFacetResponseDto,
  })
  async listProductFacets(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<PublicProductFacetResponse> {
    setStorefrontProductCacheControl(response, request);

    const query = await this.listPublicProductsQueryPipe.transform(rawQuery, {
      type: 'query',
      metatype: ListPublicProductsQueryDto,
      data: undefined,
    });
    const result = await this.listPublicProductFacetsUseCase.execute(query);

    return toPublicProductFacetResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug')
  @SkipThrottle()
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'Get product',
    description: 'Returns public product details for the supplied shop and product slugs.',
  })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiErrorResponses(productControllerErrorResponses.bySlug)
  @ApiOkResponse({
    description: 'Public product detail.',
    type: PublicProductDetailResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Product was not found.' })
  async productBySlugs(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
  ): Promise<PublicProductDetailResponse> {
    setStorefrontProductCacheControl(response, request);

    const product = await this.getPublicProductBySlugsUseCase.execute(
      shopSlug,
      productSlug,
    );

    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product was not found',
      });
    }

    return toPublicProductDetailResponse(product);
  }

  @Get('by-slug/:shop_slug/:product_slug/reviews')
  @Header('Cache-Control', 'public, max-age=60')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'List product reviews',
    description: 'Returns public reviews for the product identified by shop and product slugs.',
  })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiErrorResponses(productControllerErrorResponses.reviews)
  @ApiOkResponse({
    description: 'Public product reviews.',
    type: PublicProductReviewListResponseDto,
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
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product was not found',
      });
    }

    return toPublicProductReviewListResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug/review-images')
  @Header('Cache-Control', 'public, max-age=60')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'List review images',
    description: 'Returns public review images for the product identified by shop and product slugs.',
  })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiErrorResponses(productControllerErrorResponses.reviewImages)
  @ApiOkResponse({
    description: 'Public product review images.',
    type: PublicProductReviewImageListResponseDto,
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
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product was not found',
      });
    }

    return toPublicProductReviewImageListResponse(result);
  }
}
