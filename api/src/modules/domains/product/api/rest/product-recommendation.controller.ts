import {
  Controller, Get, Header, Param, Query, Req, UseGuards 
} from '@nestjs/common';
import {
  ApiOkResponse, ApiOperation, ApiParam, ApiTags 
} from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '~/modules/domains/auth/api/guard/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import type { Request } from 'express';
import { PublicProductViewHistoryService } from '../../app/services/public-product-view-history.service';
import { GetPublicProductRecommendationSectionsUseCase } from '../../app/use-cases/get-public-product-recommendation-sections/get-public-product-recommendation-sections.use-case';
import { RecommendPublicProductsUseCase } from '../../app/use-cases/recommend-public-products/recommend-public-products.use-case';
import { RecentPublicProductsQueryDto } from './dto/recent-public-products.query.dto';
import { RecommendPublicProductsQueryDto } from './dto/recommend-public-products.query.dto';
import { ProductActivitySessionService } from './product-activity-session.service';
import { toPublicProductRecommendationSectionsResponse } from './public-product-recommendation-sections.presenter';
import type { PublicProductRecommendationSectionsResponse } from './public-product-recommendation-sections.response';
import { toPublicProductRecommendationsResponse } from './public-product-recommendations.presenter';
import type { PublicProductRecommendationsResponse } from './public-product-recommendations.response';

type ProductRequest = Request & { user?: AuthenticatedUser | null };

@Controller('products')
@ApiTags('Product Recommendations')
@UseGuards(OptionalJwtAuthGuard)
export class ProductRecommendationController {
  constructor(
    private readonly recommendPublicProductsUseCase: RecommendPublicProductsUseCase,
    private readonly getPublicProductRecommendationSectionsUseCase: GetPublicProductRecommendationSectionsUseCase,
    private readonly publicProductViewHistoryService: PublicProductViewHistoryService,
    private readonly productActivitySessionService: ProductActivitySessionService
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
    @Query() query: RecentPublicProductsQueryDto
  ): Promise<PublicProductRecommendationsResponse> {
    const result = await this.publicProductViewHistoryService.listRecentViews({
      userId: request.user?.userId,
      guestSessionId: this.productActivitySessionService.extractSessionId(request) ?? undefined,
      limit: query.limit,
    });

    return toPublicProductRecommendationsResponse(result);
  }

  @Get('trending')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'List trending public products' })
  @ApiOkResponse({
    description: 'Trending public products.',
    schema: { type: 'object' },
  })
  async listTrendingProducts(
    @Query() query: RecentPublicProductsQueryDto
  ): Promise<PublicProductRecommendationsResponse> {
    const result = await this.publicProductViewHistoryService.listTrendingProducts({
      limit: query.limit,
    });

    return toPublicProductRecommendationsResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug/recommendations')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Recommend similar public products from a product detail page' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Recommended public products.',
    schema: { type: 'object' },
  })
  async recommendProducts(
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
    @Query() query: RecommendPublicProductsQueryDto
  ): Promise<PublicProductRecommendationsResponse> {
    const result = await this.recommendPublicProductsUseCase.execute(
      shopSlug,
      productSlug,
      query.limit
    );

    return toPublicProductRecommendationsResponse(result);
  }

  @Get('by-slug/:shop_slug/:product_slug/recommendation-sections')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'List recommendation sections for a product detail page' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Product recommendation sections.',
    schema: { type: 'object' },
  })
  async getRecommendationSections(
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
    @Query() query: RecommendPublicProductsQueryDto
  ): Promise<PublicProductRecommendationSectionsResponse> {
    const result = await this.getPublicProductRecommendationSectionsUseCase.execute(
      shopSlug,
      productSlug,
      query.limit
    );

    return toPublicProductRecommendationSectionsResponse(result);
  }
}
