import {
  Controller, Get, Header, Param, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, 
} from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '~/domains/auth/api/guard/optional-jwt-auth.guard';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { productRecommendationControllerErrorResponses } from '../errors/product-error-responses';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { OptionalCacheService } from '~/integrations/cache/optional-cache.service';
import type { Request, Response } from 'express';
import { PublicProductOrderHistoryService } from '../../../app/services/public-product-order-history.service';
import { PublicProductViewHistoryService } from '../../../app/services/public-product-view-history.service';
import { GetPublicProductRecommendationSectionsUseCase } from '../../../app/use-cases/get-public-product-recommendation-sections/get-public-product-recommendation-sections.use-case';
import { RecommendPublicProductsUseCase } from '../../../app/use-cases/recommend-public-products/recommend-public-products.use-case';
import { RecentPublicProductsQueryDto } from './dto/recent-public-products.query.dto';
import { RecommendPublicProductsQueryDto } from './dto/recommend-public-products.query.dto';
import { ProductActivitySessionService } from '../activity/product-activity-session.service';
import { toPublicProductRecommendationSectionsResponse } from './presenters/public-product-recommendation-sections.presenter';
import type { PublicProductRecommendationSectionsResponse } from './responses/public-product-recommendation-sections.response';
import { toPublicProductRecommendationsResponse } from './presenters/public-product-recommendations.presenter';
import type { PublicProductRecommendationsResponse } from './responses/public-product-recommendations.response';
import {
  PublicProductRecommendationsResponseDto,
  PublicProductRecommendationSectionsResponseDto,
} from './responses/public-product-recommendation-response.dto';

type ProductRequest = Request & { user?: AuthenticatedUser | null };
const STOREFRONT_CACHE_VARY_HEADER = 'x-market-code, x-currency, x-locale, x-channel';
const PUBLIC_STOREFRONT_CACHE_CONTROL = 'public, max-age=60';
const PRIVATE_STOREFRONT_CACHE_CONTROL = 'private, no-store';
const PUBLIC_RESPONSE_CACHE_TTL_MS = 60_000;

function setStorefrontProductCacheControl(response: Response, request: ProductRequest) {
  response.setHeader(
    'Cache-Control',
    request.user ? PRIVATE_STOREFRONT_CACHE_CONTROL : PUBLIC_STOREFRONT_CACHE_CONTROL,
  );
}

@Controller('products')
@ApiTags('Product Recommendations')
@UseGuards(OptionalJwtAuthGuard)
@ApiErrorResponses(productRecommendationControllerErrorResponses.common)
export class ProductRecommendationController {
  constructor(
    private readonly recommendPublicProductsUseCase: RecommendPublicProductsUseCase,
    private readonly getPublicProductRecommendationSectionsUseCase: GetPublicProductRecommendationSectionsUseCase,
    private readonly publicProductOrderHistoryService: PublicProductOrderHistoryService,
    private readonly publicProductViewHistoryService: PublicProductViewHistoryService,
    private readonly productActivitySessionService: ProductActivitySessionService,
    private readonly optionalCacheService: OptionalCacheService,
  ) {}

  @Get('recently-viewed')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List recently viewed products',
    description: 'Returns recently viewed public products for the current user or guest session.',
  })
  @ApiOkResponse({
    description: 'Recently viewed public products.',
    type: PublicProductRecommendationsResponseDto,
  })
  async listRecentlyViewedProducts(
    @Req() request: ProductRequest,
    @Query() query: RecentPublicProductsQueryDto,
  ): Promise<PublicProductRecommendationsResponse> {
    const result = await this.publicProductViewHistoryService.listRecentViews({
      userId: request.user?.userId,
      guestSessionId: this.productActivitySessionService.extractSessionId(request) ?? undefined,
      limit: query.limit,
    });

    return toPublicProductRecommendationsResponse(result);
  }

  @Get('trending')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'List trending products',
    description: 'Returns trending public products.',
  })
  @ApiOkResponse({
    description: 'Trending public products.',
    type: PublicProductRecommendationsResponseDto,
  })
  async listTrendingProducts(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() query: RecentPublicProductsQueryDto,
  ): Promise<PublicProductRecommendationsResponse> {
    setStorefrontProductCacheControl(response, request);

    const result = await this.getCachedPublicResponse(
      request,
      buildPublicCacheKey(request, 'products:trending', [query.limit]),
      () => this.publicProductViewHistoryService.listTrendingProducts({
        limit: query.limit,
      }),
    );

    return toPublicProductRecommendationsResponse(result);
  }

  @Get('best-sellers')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'List best sellers',
    description: 'Returns public products with the highest sales.',
  })
  @ApiOkResponse({
    description: 'Best-selling public products.',
    type: PublicProductRecommendationsResponseDto,
  })
  async listBestSellingProducts(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() query: RecentPublicProductsQueryDto,
  ): Promise<PublicProductRecommendationsResponse> {
    setStorefrontProductCacheControl(response, request);

    const result = await this.getCachedPublicResponse(
      request,
      buildPublicCacheKey(request, 'products:best-sellers', [query.limit]),
      () => this.publicProductOrderHistoryService.listBestSellingProducts({
        limit: query.limit,
      }),
    );

    return toPublicProductRecommendationsResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug/recommendations')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'Recommend similar products',
    description: 'Returns public product recommendations for the product identified by shop and product slugs.',
  })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Recommended public products.',
    type: PublicProductRecommendationsResponseDto,
  })
  async recommendProducts(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
    @Query() query: RecommendPublicProductsQueryDto,
  ): Promise<PublicProductRecommendationsResponse> {
    setStorefrontProductCacheControl(response, request);

    const result = await this.getCachedPublicResponse(
      request,
      buildPublicCacheKey(request, 'products:recommendations', [
        shopSlug,
        productSlug,
        query.limit,
      ]),
      () => this.recommendPublicProductsUseCase.execute(
        shopSlug,
        productSlug,
        query.limit,
      ),
    );

    return toPublicProductRecommendationsResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug/recommendation-sections')
  @Header('Vary', STOREFRONT_CACHE_VARY_HEADER)
  @ApiOperation({
    summary: 'List product recommendations',
    description: 'Returns recommendation sections for the product identified by shop and product slugs.',
  })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Product recommendation sections.',
    type: PublicProductRecommendationSectionsResponseDto,
  })
  async getRecommendationSections(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
    @Query() query: RecommendPublicProductsQueryDto,
  ): Promise<PublicProductRecommendationSectionsResponse> {
    setStorefrontProductCacheControl(response, request);
    const result = await this.getCachedPublicResponse(
      request,
      buildPublicCacheKey(request, 'products:recommendation-sections', [
        shopSlug,
        productSlug,
        query.limit,
      ]),
      () => this.getPublicProductRecommendationSectionsUseCase.execute(
        shopSlug,
        productSlug,
        query.limit,
      ),
    );

    return toPublicProductRecommendationSectionsResponse(result);
  }

  private async getCachedPublicResponse<T>(
    request: ProductRequest,
    cacheKey: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (request.user) {
      return loader();
    }

    const cached = await this.optionalCacheService.get<T>(
      'storefront.public-products',
      cacheKey,
    );

    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const result = await loader();

    await this.optionalCacheService.set(
      'storefront.public-products',
      cacheKey,
      result,
      PUBLIC_RESPONSE_CACHE_TTL_MS,
    );

    return result;
  }
}

function buildPublicCacheKey(
  request: ProductRequest,
  resource: string,
  params: Array<string | number | undefined>,
): string {
  return [
    'storefront-public',
    resource,
    request.get?.('x-market-code') ?? 'default-market',
    request.get?.('x-currency') ?? 'default-currency',
    request.get?.('x-locale') ?? 'default-locale',
    request.get?.('x-channel') ?? 'default-channel',
    ...params.map((value) => String(value ?? '')),
  ].join(':');
}
