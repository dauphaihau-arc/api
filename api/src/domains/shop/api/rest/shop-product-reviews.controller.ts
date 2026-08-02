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
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ListShopProductReviewsUseCase } from '~/domains/product/app/use-cases/list-shop-product-reviews/list-shop-product-reviews.use-case';
import { ShopAccessService } from '../../app/services/shop-access.service';
import { ListShopProductReviewsQueryDto } from './dto/list-shop-product-reviews.query.dto';
import { toShopProductReviewListResponse } from './shop-product-review.presenter';
import type { ShopProductReviewListResponse } from './shop-product-review.response';

@Controller('shops/:shop_id/reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Product Reviews')
@ApiCookieAuth('accessCookie')
export class ShopProductReviewsController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly listShopProductReviewsUseCase: ListShopProductReviewsUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List product reviews for a shop' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated shop review list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Query() query: ListShopProductReviewsQueryDto,
  ): Promise<ShopProductReviewListResponse> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    return this.listShopProductReviewsUseCase.execute({
      shopId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      productId: query.productId,
      sort: query.sort,
    }).then(toShopProductReviewListResponse);
  }
}
