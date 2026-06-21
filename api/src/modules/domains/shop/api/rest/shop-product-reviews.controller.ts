import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
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
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ListShopProductReviewsUseCase } from '~/modules/domains/product/app/use-cases/list-shop-product-reviews/list-shop-product-reviews.use-case';
import { ShopRepository } from '../../app/ports/shop.repository';
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
    private readonly shopRepository: ShopRepository,
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
    await this.assertActorCanManageShop(currentUser, shopId);

    return this.listShopProductReviewsUseCase.execute({
      shopId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      productId: query.productId,
      sort: query.sort,
    }).then(toShopProductReviewListResponse);
  }

  private async assertActorCanManageShop(
    currentUser: AuthenticatedUser,
    shopId: string,
  ): Promise<void> {
    if (currentUser.roles.includes('admin')) {
      const shop = await this.shopRepository.findById(shopId);

      if (!shop) {
        throw new NotFoundException('Shop was not found');
      }

      return;
    }

    const shop = await this.shopRepository.findOwnedById(shopId, currentUser.userId);

    if (shop) {
      return;
    }

    const existingShop = await this.shopRepository.findById(shopId);

    if (!existingShop) {
      throw new NotFoundException('Shop was not found');
    }

    throw new ForbiddenException('You do not own this shop');
  }
}
