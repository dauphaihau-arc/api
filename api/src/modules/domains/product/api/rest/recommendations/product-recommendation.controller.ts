import {
  Controller, Get, Header, Inject, Param, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, 
} from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '~/modules/domains/auth/api/guard/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import type { Cache } from 'cache-manager';
import type { Request, Response } from 'express';
import { PublicProductOrderHistoryService } from '../../../app/services/public-product-order-history.service';
import { PublicProductViewHistoryService } from '../../../app/services/public-product-view-history.service';
import { GetPublicProductRecommendationSectionsUseCase } from '../../../app/use-cases/get-public-product-recommendation-sections/get-public-product-recommendation-sections.use-case';
import { RecommendPublicProductsUseCase } from '../../../app/use-cases/recommend-public-products/recommend-public-products.use-case';
import { RecentPublicProductsQueryDto } from './dto/recent-public-products.query.dto';
import { RecommendPublicProductsQueryDto } from './dto/recommend-public-products.query.dto';
import { ProductActivitySessionService } from '../activity/product-activity-session.service';
import { toPublicProductRecommendationSectionsResponse } from './presenters/public-product-recommendation-sections.presenter';
import type { PublicProductRecommendationSectionsResponse } from './response/public-product-recommendation-sections.response';
import { toPublicProductRecommendationsResponse } from './presenters/public-product-recommendations.presenter';
import type { PublicProductRecommendationsResponse } from './response/public-product-recommendations.response';

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
export class ProductRecommendationController {
  constructor(
    private readonly recommendPublicProductsUseCase: RecommendPublicProductsUseCase,
    private readonly getPublicProductRecommendationSectionsUseCase: GetPublicProductRecommendationSectionsUseCase,
    private readonly publicProductOrderHistoryService: PublicProductOrderHistoryService,
    private readonly publicProductViewHistoryService: PublicProductViewHistoryService,
    private readonly productActivitySessionService: ProductActivitySessionService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  @Get('recently-viewed')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List recently viewed public products' })
  @ApiOkResponse({
    description: 'Recently viewed public products.',
    schema: { type: 'object' },
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
  @ApiOperation({ summary: 'List trending public products' })
  @ApiOkResponse({
    description: 'Trending public products.',
    schema: { type: 'object' },
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
  @ApiOperation({ summary: 'List best-selling public products' })
  @ApiOkResponse({
    description: 'Best-selling public products.',
    schema: { type: 'object' },
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
  @ApiOperation({ summary: 'Recommend similar public products from a product detail page' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Recommended public products.',
    schema: { type: 'object' },
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
  @ApiOperation({ summary: 'List recommendation sections for a product detail page' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Product recommendation sections.',
    schema: { type: 'object' },
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

    const cached = await this.cacheManager.get<T>(cacheKey);

    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const result = await loader();
    await this.cacheManager.set(cacheKey, result, PUBLIC_RESPONSE_CACHE_TTL_MS);
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
