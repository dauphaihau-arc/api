import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ListShopProductReviewsUseCase } from '~/domains/product/app/use-cases/list-shop-product-reviews/list-shop-product-reviews.use-case';
import { ShopAccessService } from '../../app/services/shop-access.service';
import { ProductLookupService } from '~/domains/product/app/services/product-lookup.service';
import { ListShopProductReviewsQueryDto } from './dto/list-shop-product-reviews.query.dto';
import { shopProductReviewsControllerErrorResponses } from './errors/shop-error-responses';
import { toShopProductReviewListResponse } from './presenters/shop-product-review.presenter';
import {
  ShopProductReviewListResponseDto,
  type ShopProductReviewListResponse,
} from './responses/shop-product-review.response';

@Controller('shops/:shop_id/reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Product Reviews')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(shopProductReviewsControllerErrorResponses.common)
export class ShopProductReviewsController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly listShopProductReviewsUseCase: ListShopProductReviewsUseCase,
    private readonly productLookupService: ProductLookupService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List product reviews for a shop' })
  @ApiErrorResponses(shopProductReviewsControllerErrorResponses.list)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated shop review list.',
    type: ShopProductReviewListResponseDto,
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Query() query: ListShopProductReviewsQueryDto,
  ): Promise<ShopProductReviewListResponse> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    const result = await this.listShopProductReviewsUseCase.execute({
      shopId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      productId: query.productId ? await this.productLookupService.resolveProductPublicId(query.productId) : undefined,
      sort: query.sort,
    });

    return toShopProductReviewListResponse(result);
  }
}
